/**
 * JSON export and import — the second of PLAN §2.2's defences against a lost
 * phone being a lost training history. With no server and no sync, this file
 * IS the backup story, so both directions are deliberately strict:
 *
 * - Export is a complete snapshot of every table, taken inside one
 *   transaction so a mid-workout export can never capture half a write.
 * - Import validates the whole file first and then replaces everything inside
 *   one transaction — it either fully succeeds or leaves the database exactly
 *   as it was. There is no merge: two histories woven together is a lie the
 *   progression engine would then train on.
 */

import { db } from './db'
import type {
  AppSettings,
  DayTemplate,
  Exercise,
  ExerciseFeedback,
  LoggedSet,
  Mesocycle,
  MuscleGroup,
  Prescription,
  Session,
  SorenessFeedback,
} from './schema'

export const BACKUP_FORMAT = 'workout-tracker-backup'
export const BACKUP_VERSION = 1

export interface BackupData {
  muscleGroups: MuscleGroup[]
  exercises: Exercise[]
  dayTemplates: DayTemplate[]
  mesocycles: Mesocycle[]
  sessions: Session[]
  sets: LoggedSet[]
  exerciseFeedback: ExerciseFeedback[]
  sorenessFeedback: SorenessFeedback[]
  prescriptions: Prescription[]
  settings: AppSettings[]
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: number
  data: BackupData
}

const TABLE_NAMES = [
  'muscleGroups',
  'exercises',
  'dayTemplates',
  'mesocycles',
  'sessions',
  'sets',
  'exerciseFeedback',
  'sorenessFeedback',
  'prescriptions',
  'settings',
] as const

const ALL_TABLES = TABLE_NAMES.map((name) => db[name])

/**
 * Takes the full snapshot. `lastBackupAt` is stamped inside the same
 * transaction *before* reading, so the exported file and the database agree
 * about when the backup happened — restoring this file onto a new phone
 * doesn't immediately nag about a backup that was just made.
 */
export async function exportBackup(now: Date = new Date()): Promise<BackupFile> {
  const timestamp = now.getTime()

  const data = await db.transaction('rw', ALL_TABLES, async () => {
    await db.settings.update('app', { lastBackupAt: timestamp, updatedAt: timestamp })
    const [
      muscleGroups,
      exercises,
      dayTemplates,
      mesocycles,
      sessions,
      sets,
      exerciseFeedback,
      sorenessFeedback,
      prescriptions,
      settings,
    ] = await Promise.all(TABLE_NAMES.map((name) => db[name].toArray()))
    return {
      muscleGroups,
      exercises,
      dayTemplates,
      mesocycles,
      sessions,
      sets,
      exerciseFeedback,
      sorenessFeedback,
      prescriptions,
      settings,
    } as BackupData
  })

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: timestamp, data }
}

/** What an import will replace and restore — shown before confirming. */
export interface BackupSummary {
  exportedAt: number
  sessions: number
  sets: number
  mesocycles: number
  exercises: number
}

/**
 * Checks that an unknown parsed JSON value is a usable backup. Throws with a
 * plain-English message naming what is wrong; returns the typed file when it
 * holds. Deliberately structural rather than exhaustive: the goal is to
 * reject the wrong file (or a truncated one) loudly, not to re-validate every
 * field the app itself wrote.
 */
export function validateBackup(parsed: unknown): BackupFile {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('This file is not a backup — it does not contain app data.')
  }
  const file = parsed as Record<string, unknown>
  if (file['format'] !== BACKUP_FORMAT) {
    throw new Error('This file is not a workout backup.')
  }
  if (file['version'] !== BACKUP_VERSION) {
    throw new Error(
      'This backup was made by a different version of the app and cannot be read.',
    )
  }
  if (typeof file['exportedAt'] !== 'number') {
    throw new Error('This backup is damaged: it has no export date.')
  }
  const data = file['data']
  if (typeof data !== 'object' || data === null) {
    throw new Error('This backup is damaged: the data section is missing.')
  }
  const tables = data as Record<string, unknown>
  for (const name of TABLE_NAMES) {
    const rows = tables[name]
    if (!Array.isArray(rows)) {
      throw new Error(`This backup is damaged: the ${name} records are missing.`)
    }
    for (const row of rows) {
      if (
        typeof row !== 'object' ||
        row === null ||
        typeof (row as Record<string, unknown>)['id'] !== 'string'
      ) {
        throw new Error(`This backup is damaged: a ${name} record is malformed.`)
      }
    }
  }

  const typed = parsed as BackupFile
  const settings = typed.data.settings.find((row) => row.id === 'app')
  if (!settings) {
    throw new Error('This backup is damaged: it has no app settings record.')
  }
  if (!typed.data.mesocycles.some((m) => m.id === settings.activeMesocycleId)) {
    throw new Error(
      'This backup is damaged: its active training block is missing from it.',
    )
  }
  return typed
}

export function summarizeBackup(file: BackupFile): BackupSummary {
  return {
    exportedAt: file.exportedAt,
    sessions: file.data.sessions.length,
    sets: file.data.sets.length,
    mesocycles: file.data.mesocycles.length,
    exercises: file.data.exercises.length,
  }
}

/**
 * Replaces the entire database with the backup's contents. All-or-nothing:
 * runs in one transaction, so a failure part-way leaves the current data
 * untouched. Callers confirm with the user first — this is the one action in
 * the app that destroys data by design.
 */
export async function importBackup(file: BackupFile): Promise<BackupSummary> {
  await db.transaction('rw', ALL_TABLES, async () => {
    await Promise.all(TABLE_NAMES.map((name) => db[name].clear()))
    await Promise.all([
      db.muscleGroups.bulkAdd(file.data.muscleGroups),
      db.exercises.bulkAdd(file.data.exercises),
      db.dayTemplates.bulkAdd(file.data.dayTemplates),
      db.mesocycles.bulkAdd(file.data.mesocycles),
      db.sessions.bulkAdd(file.data.sessions),
      db.sets.bulkAdd(file.data.sets),
      db.exerciseFeedback.bulkAdd(file.data.exerciseFeedback),
      db.sorenessFeedback.bulkAdd(file.data.sorenessFeedback),
      db.prescriptions.bulkAdd(file.data.prescriptions),
      db.settings.bulkAdd(file.data.settings),
    ])
  })
  return summarizeBackup(file)
}
