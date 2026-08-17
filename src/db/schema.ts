/**
 * Row types for every table. See PLAN.md §4.
 *
 * Three properties here exist so a sync layer can be added later without a
 * rewrite, per BRIEF.md Part 2:
 *   1. Every primary key is a UUID string, never an auto-incrementing number,
 *      so two devices can create records offline without colliding.
 *   2. Every row carries `updatedAt`, so a future sync can resolve conflicts.
 *   3. Rows reference each other by UUID only — no positional or numeric
 *      coupling — so tables can sync independently.
 */

/** Milliseconds since epoch. */
export type Timestamp = number
/** Calendar day in the user's local timezone, `YYYY-MM-DD`. */
export type IsoDate = string

export type ExerciseType = 'compound' | 'isolation'
export type DayLetter = 'A' | 'B' | 'C'

/** Answers to the three feedback prompts (BRIEF.md Part 5). */
export type Soreness = 'none' | 'a_little' | 'still_sore'
export type Pump = 'low' | 'moderate' | 'great'
/** Reps left in the tank on the final set. */
export type Rir = '3+' | '2' | '1' | '0'

/** What the engine did to the load, used to enforce the no-two-in-a-row rule. */
export type LoadAction = 'increase' | 'hold' | 'decrease'

export type SessionStatus = 'in_progress' | 'completed' | 'skipped'

/**
 * A trained muscle. Its own table with a UUID key rather than a name repeated
 * across exercises, day templates and feedback: renaming "Quads" in Settings
 * must not silently detach an exercise from its soreness prompt or orphan every
 * historical feedback row.
 */
export interface MuscleGroup {
  id: string
  name: string
  /**
   * The group whose soreness answer this one inherits when it isn't prompted
   * for directly — how PLAN.md §2.3 keeps the feedback flow under five seconds
   * without leaving smaller muscles unanswered. Null when it stands alone.
   */
  inheritsFromId: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * A movement in the library. Editable: the seeded list is a starting point, not
 * a hardcoded structure (BRIEF.md Part 4).
 */
export interface Exercise {
  id: string
  name: string
  type: ExerciseType
  /** Drives which soreness answer applies to this exercise. */
  muscleGroupId: string
  repTargetMin: number
  repTargetMax: number
  /** Default 5 lb, editable per exercise since some stacks jump by 10 or 15. */
  weightIncrementLb: number
  /** Compound 150s, isolation 120s by default. Configurable per exercise. */
  restSeconds: number
  /** Soft delete, so historical sets keep resolving to a name. */
  isArchived: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** One day of the rotation: which exercises, in what order, on which weekdays. */
export interface DayTemplate {
  id: string
  letter: DayLetter
  /** e.g. "Chest & Triceps" */
  name: string
  /** 0 = Sunday … 6 = Saturday. Weekday-locked, per PLAN.md A-1. */
  weekdays: number[]
  /** Ordered. Reordering here reorders the session. */
  exerciseIds: string[]
  /**
   * Which muscle groups get a soreness prompt before training starts. Kept
   * separate from the exercises' own muscle groups so the prompt list can be
   * trimmed without retagging exercises — see PLAN.md §2.3. Groups not listed
   * here inherit their answer via `MuscleGroup.inheritsFromId`.
   */
  sorenessPromptGroupIds: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** A six-week block. Started manually by the user, per PLAN.md A-4. */
export interface Mesocycle {
  id: string
  /** Local calendar date of the Monday this block began. */
  startDate: IsoDate
  /** 5 accumulation weeks + 1 deload. */
  totalWeeks: number
  /** Which week number is the deload. */
  deloadWeek: number
  status: 'active' | 'completed'
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** One training day. */
export interface Session {
  id: string
  date: IsoDate
  dayTemplateId: string
  mesocycleId: string
  weekNumber: number
  isDeload: boolean
  status: SessionStatus
  /** Where to resume if the app is killed mid-workout. */
  currentExerciseIndex: number
  cardio: CardioEntry | null
  startedAt: Timestamp
  completedAt: Timestamp | null
  updatedAt: Timestamp
}

export interface CardioEntry {
  durationMin: number
  inclinePct: number
  speedMph: number
}

/** One logged set. This is the record that must never be lost. */
export interface LoggedSet {
  id: string
  sessionId: string
  exerciseId: string
  /** 0-based position within this exercise, this session. */
  setIndex: number
  weightLb: number
  reps: number
  /** What the engine asked for, kept so History can compare plan to reality. */
  prescribedWeightLb: number | null
  prescribedReps: number | null
  loggedAt: Timestamp
  updatedAt: Timestamp
}

/** Pump / RIR / joint pain, asked after the last set of each exercise. */
export interface ExerciseFeedback {
  id: string
  sessionId: string
  exerciseId: string
  pump: Pump
  rir: Rir
  /** The dismissible third question; null when it was skipped. */
  jointPain: boolean | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Soreness, asked once per muscle group before training starts. */
export interface SorenessFeedback {
  id: string
  sessionId: string
  muscleGroupId: string
  soreness: Soreness
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * What the engine prescribed for one exercise in one session, including the
 * plain-English sentence it used to explain itself (BRIEF.md Part 5).
 */
export interface Prescription {
  id: string
  mesocycleId: string
  sessionId: string
  exerciseId: string
  weekNumber: number
  plannedSets: number
  /** Null only the very first time an exercise is performed. */
  plannedWeightLb: number | null
  repTargetMin: number
  repTargetMax: number
  /** Set when the recommendation is "beat last session's reps". */
  minRepsToBeat: number | null
  /** 4 during a deload week; null otherwise. */
  targetRir: number | null
  loadAction: LoadAction
  /** The one sentence the engine must always be able to give. */
  sentence: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Singleton row. */
export interface AppSettings {
  id: 'app'
  activeMesocycleId: string
  /** Pre-fills the cardio screen with last session's settings. */
  lastCardio: CardioEntry
  defaultWeightIncrementLb: number
  defaultRestCompoundSeconds: number
  defaultRestIsolationSeconds: number
  /** Set by the seed so we can tell a fresh install from an upgraded one. */
  seededAt: Timestamp
  updatedAt: Timestamp
}
