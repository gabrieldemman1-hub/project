import Dexie, { type EntityTable } from 'dexie'

import type {
  AppSettings,
  DayTemplate,
  Exercise,
  ExerciseFeedback,
  LoggedSet,
  Mesocycle,
  Prescription,
  Session,
  SorenessFeedback,
} from './schema'

/**
 * The Dexie instance. This is the only file that constructs it.
 *
 * Components never import this directly — they go through queries.ts and
 * mutations.ts, per CLAUDE.md.
 */
export class WorkoutDatabase extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  dayTemplates!: EntityTable<DayTemplate, 'id'>
  mesocycles!: EntityTable<Mesocycle, 'id'>
  sessions!: EntityTable<Session, 'id'>
  sets!: EntityTable<LoggedSet, 'id'>
  exerciseFeedback!: EntityTable<ExerciseFeedback, 'id'>
  sorenessFeedback!: EntityTable<SorenessFeedback, 'id'>
  prescriptions!: EntityTable<Prescription, 'id'>
  settings!: EntityTable<AppSettings, 'id'>

  constructor(name = 'workout-tracker') {
    super(name)

    // Only fields that are queried or sorted on are indexed. `sets` carries the
    // most indexes because it is read on every screen; everything else stays
    // lean so writes during a session are as fast as possible.
    this.version(1).stores({
      exercises: 'id, name, muscleGroup, isArchived',
      dayTemplates: 'id, letter, *weekdays',
      mesocycles: 'id, startDate, status',
      sessions: 'id, date, status, mesocycleId, dayTemplateId, [status+date]',
      sets: 'id, sessionId, exerciseId, loggedAt, [sessionId+exerciseId]',
      exerciseFeedback: 'id, sessionId, exerciseId, [sessionId+exerciseId]',
      sorenessFeedback: 'id, sessionId, muscleGroup',
      prescriptions:
        'id, sessionId, exerciseId, mesocycleId, [exerciseId+createdAt]',
      settings: 'id',
    })
  }
}

export const db = new WorkoutDatabase()
