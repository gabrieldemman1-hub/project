import { MIN_SETS } from './sets'
import { topSet } from './load'
import type { EngineExercise, LastExerciseSession, Recommendation } from './types'

/** Deload week aims well short of failure. */
export const DELOAD_TARGET_RIR = 4

/**
 * −10%, landed on a real pin: rounded to the NEAREST increment, with an exact
 * tie rounding down (decision A-3). 150 → 135. 145 → 130 (130.5 is a tie).
 * 155 → 140 (139.5 is nearer 140).
 */
export function roundToIncrement(weightLb: number, incrementLb: number): number {
  const down = Math.floor(weightLb / incrementLb) * incrementLb
  const up = down + incrementLb
  return weightLb - down <= up - weightLb ? down : up
}

/**
 * Week six (BRIEF Part 5): sets halved rounding down but never under 2, load
 * −10% on the nearest pin, target RIR 4, and no progression — feedback is
 * neither collected nor applied. Short-circuits the whole engine.
 */
export function deloadRecommendation(
  exercise: EngineExercise,
  last: LastExerciseSession,
): Recommendation {
  const sets = Math.max(MIN_SETS, Math.floor(last.sets.length / 2))
  const weightLb = Math.max(
    exercise.weightIncrementLb,
    roundToIncrement(topSet(last.sets).weightLb * 0.9, exercise.weightIncrementLb),
  )

  return {
    sets,
    weightLb,
    repTargetMin: exercise.repTargetMin,
    repTargetMax: exercise.repTargetMax,
    repsToBeat: null,
    targetRir: DELOAD_TARGET_RIR,
    loadAction: 'hold',
    sentence: `Deload — ${sets} easy sets at ${weightLb} lb, stop with ${DELOAD_TARGET_RIR} reps in the tank.`,
    reasons: ['deload'],
  }
}
