import { deloadRecommendation } from './deload'
import { loadDecision } from './load'
import { buildSentence } from './sentence'
import { clampSets, FIRST_TIME_SETS, setsDelta } from './sets'
import type { ExerciseHistoryInput, Recommendation } from './types'

/**
 * The progression engine (BRIEF Part 5, PLAN §6). Pure: history in,
 * recommendation out. No React, no database, no clock, no randomness — the
 * whole thing is this call tree, so tweaking the program later means editing
 * the matrix in sets.ts or the ordered rules in load.ts and re-running the
 * tests.
 */
export function recommend(input: ExerciseHistoryInput): Recommendation {
  const { exercise, soreness, last, isDeload } = input

  if (!last || last.sets.length === 0) {
    return {
      sets: FIRST_TIME_SETS,
      weightLb: null,
      repTargetMin: exercise.repTargetMin,
      repTargetMax: exercise.repTargetMax,
      repsToBeat: null,
      targetRir: null,
      loadAction: 'hold',
      sentence: `First time — pick a weight you can get ${exercise.repTargetMin}–${exercise.repTargetMax} clean reps with, for ${FIRST_TIME_SETS} sets.`,
      reasons: ['first-time'],
    }
  }

  if (isDeload) {
    return deloadRecommendation(exercise, last)
  }

  const decision = setsDelta(soreness, last.pump)
  const setsBefore = last.sets.length
  const sets = clampSets(setsBefore + decision.delta)

  const load = loadDecision(exercise, last, soreness)

  const feedbackMissing = last.rir === null && last.pump === null

  return {
    sets,
    weightLb: load.weightLb,
    repTargetMin: exercise.repTargetMin,
    repTargetMax: exercise.repTargetMax,
    repsToBeat: load.repsToBeat,
    targetRir: null,
    loadAction: load.action,
    sentence: buildSentence({
      load,
      setsDecision: decision,
      setsBefore,
      setsAfter: sets,
      incrementLb: exercise.weightIncrementLb,
      feedbackMissing,
    }),
    reasons: [decision.reason, ...load.reasons],
  }
}
