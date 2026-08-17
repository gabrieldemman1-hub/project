import { beforeEach, describe, expect, it } from 'vitest'

import { exportBackup, importBackup, validateBackup, type BackupFile } from './backup'
import { db } from './db'
import { completeSession, saveSet, skipToday, startSession } from './mutations'
import { getDashboardView } from './queries'
import { seedIfEmpty } from './seed'

/**
 * The backup story (BRIEF Phase 7, PLAN §2.2). These are the tests that stand
 * between the product owner and losing four months of training to a dropped
 * phone: the export must be complete, the import must restore it exactly, a
 * wrong or damaged file must be rejected loudly, and a failed import must
 * leave the current data untouched.
 */

const CARDIO = { durationMin: 45, inclinePct: 10, speedMph: 3 }

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedIfEmpty(new Date(2026, 7, 16))
})

/** Logs a real Monday session so backups have distinguishable content. */
async function trainMonday(): Promise<void> {
  const template = await db.dayTemplates.where('letter').equals('A').first()
  const pressId = template?.exerciseIds[0]
  if (!pressId) throw new Error('no Day A press')
  const monday = await startSession('2026-08-17')
  await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
  await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 1, weightLb: 185, reps: 8 })
  await completeSession(monday.id, CARDIO)
}

describe('exportBackup', () => {
  it('snapshots every table and stamps the export time on both sides', async () => {
    await trainMonday()
    const when = new Date(2026, 7, 18, 12, 0)
    const backup = await exportBackup(when)

    expect(backup.format).toBe('workout-tracker-backup')
    expect(backup.version).toBe(1)
    expect(backup.exportedAt).toBe(when.getTime())

    expect(backup.data.sessions).toHaveLength(1)
    expect(backup.data.sets).toHaveLength(2)
    expect(backup.data.exercises.length).toBeGreaterThan(0)
    expect(backup.data.dayTemplates).toHaveLength(3)
    expect(backup.data.mesocycles).toHaveLength(1)
    expect(backup.data.muscleGroups.length).toBeGreaterThan(0)
    expect(backup.data.settings).toHaveLength(1)

    // The file and the database agree about when the backup happened, so
    // restoring onto a new phone doesn't immediately nag about backups.
    expect(backup.data.settings[0]?.lastBackupAt).toBe(when.getTime())
    expect((await db.settings.get('app'))?.lastBackupAt).toBe(when.getTime())
  })
})

describe('importBackup — the round trip', () => {
  it('restores an exported history exactly onto a wiped database', async () => {
    await trainMonday()
    await skipToday('2026-08-18')
    const before = await getDashboardView('2026-08-19')
    const backup = await exportBackup(new Date(2026, 7, 19, 8, 0))

    // A new phone: empty, then freshly seeded on first open — with brand-new
    // ids throughout, which is exactly what a restore must overwrite.
    await db.delete()
    await db.open()
    await seedIfEmpty(new Date(2026, 7, 19))
    expect(await db.sessions.count()).toBe(0)

    // The file survives being written out and read back in.
    const summary = await importBackup(
      validateBackup(JSON.parse(JSON.stringify(backup))),
    )
    expect(summary).toEqual({
      exportedAt: backup.exportedAt,
      sessions: 2,
      sets: 2,
      mesocycles: 1,
      exercises: backup.data.exercises.length,
    })

    const after = await getDashboardView('2026-08-19')
    expect(after).toEqual(before)
    expect(await db.sets.count()).toBe(2)
    expect((await db.settings.get('app'))?.lastBackupAt).toBe(backup.exportedAt)
  })
})

describe('validateBackup — the wrong file is rejected loudly', () => {
  async function realBackup(): Promise<BackupFile> {
    await trainMonday()
    return JSON.parse(JSON.stringify(await exportBackup(new Date(2026, 7, 18)))) as BackupFile
  }

  it('rejects things that are not backups at all', () => {
    expect(() => validateBackup(null)).toThrow('not a backup')
    expect(() => validateBackup('a string')).toThrow('not a backup')
    expect(() => validateBackup({ some: 'json' })).toThrow('not a workout backup')
  })

  it('rejects a future format version instead of guessing', async () => {
    const backup = await realBackup()
    expect(() => validateBackup({ ...backup, version: 99 })).toThrow(
      'different version',
    )
  })

  it('rejects a truncated file with a missing table', async () => {
    const backup = await realBackup()
    const damaged = { ...backup, data: { ...backup.data } } as Record<string, unknown>
    delete (damaged['data'] as Record<string, unknown>)['sets']
    expect(() => validateBackup(damaged)).toThrow('sets records are missing')
  })

  it('rejects malformed rows and a missing settings record', async () => {
    const backup = await realBackup()
    expect(() =>
      validateBackup({
        ...backup,
        data: { ...backup.data, sessions: [...backup.data.sessions, { no: 'id' }] },
      }),
    ).toThrow('sessions record is malformed')
    expect(() =>
      validateBackup({ ...backup, data: { ...backup.data, settings: [] } }),
    ).toThrow('no app settings record')
  })

  it('rejects a file whose active block is missing from its own data', async () => {
    const backup = await realBackup()
    expect(() =>
      validateBackup({ ...backup, data: { ...backup.data, mesocycles: [] } }),
    ).toThrow('active training block is missing')
  })

  it('a rejected file leaves the current database untouched', async () => {
    const backup = await realBackup()
    const setsBefore = await db.sets.count()
    expect(() =>
      validateBackup({ ...backup, data: { ...backup.data, settings: [] } }),
    ).toThrow()
    // Validation throws before importBackup is ever reached; nothing changed.
    expect(await db.sets.count()).toBe(setsBefore)
    expect(await db.sessions.count()).toBe(1)
  })
})

describe('the dashboard backup nudge', () => {
  it('stays quiet within 30 days of install and of the last export', async () => {
    // Seeded 2026-08-16: twenty days later, no nudge.
    expect((await getDashboardView('2026-09-05')).backupOverdueDays).toBeNull()
  })

  it('appears once no export has happened for over 30 days', async () => {
    const view = await getDashboardView('2026-09-16')
    expect(view.backupOverdueDays).toBe(31)
  })

  it('resets when a backup is exported', async () => {
    await exportBackup(new Date(2026, 8, 10)) // 10 September
    expect((await getDashboardView('2026-09-16')).backupOverdueDays).toBeNull()
    expect((await getDashboardView('2026-10-12')).backupOverdueDays).toBe(32)
  })
})
