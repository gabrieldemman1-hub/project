/**
 * The engine's vocabulary. This module — and everything in src/engine/ —
 * imports nothing from React, Dexie, or the database layer: history in,
 * recommendation out (BRIEF Part 3). The database schema imports these types
 * from here, not the other way round, so the tested core stays dependency-free
 * while the two layers can never drift apart.
 */

/** "How sore is your [chest] from last time?" — asked at the start of today. */
export type Soreness = 'none' | 'a_little' | 'still_sore'

/** "How was the pump?" — asked after the last set of the exercise. */
export type Pump = 'low' | 'moderate' | 'great'

/** "Reps left in the tank on that last set?" */
export type Rir = '3+' | '2' | '1' | '0'

/** What the engine did to the load for a session, recorded to enforce the
 * never-increase-twice-in-a-row rule without recomputing history. */
export type LoadAction = 'increase' | 'hold' | 'decrease'

/** The slice of an exercise the engine needs. */
export interface EngineExercise {
  repTargetMin: number
  repTargetMax: number
  weightIncrementLb: number
}

export interface PerformedSet {
  weightLb: number
  reps: number
}

/**
 * What happened the last time this exercise was trained: the sets performed,
 * the feedback given after its last set, and what the engine itself did to
 * the load that day. Feedback fields are null when the prompt was skipped;
 * loadAction is null for sessions logged before the engine existed.
 */
export interface LastExerciseSession {
  /** Non-empty — an exercise with no sets performed has no last session. */
  sets: PerformedSet[]
  pump: Pump | null
  rir: Rir | null
  jointPain: boolean | null
  loadAction: LoadAction | null
}

/** Everything the engine is allowed to know. */
export interface ExerciseHistoryInput {
  exercise: EngineExercise
  /** Reported today, about how the body responded since last session. */
  soreness: Soreness | null
  /** Null the first time an exercise is ever trained. */
  last: LastExerciseSession | null
  /** Week six: half sets, −10%, stop well short, no progression. */
  isDeload: boolean
}

export interface Recommendation {
  sets: number
  /** Null only the very first time: the user picks the opening weight once. */
  weightLb: number | null
  repTargetMin: number
  repTargetMax: number
  /**
   * When the prescription is "same weight, beat last session's reps": the rep
   * count to beat — last session's top set. Null otherwise.
   */
  repsToBeat: number | null
  /** 4 on a deload — stop well short. Null otherwise. */
  targetRir: number | null
  loadAction: LoadAction
  /** The one plain-English sentence the engine must always be able to give. */
  sentence: string
  /** Machine-readable trail of every rule that fired, for tests and debugging. */
  reasons: string[]
}
