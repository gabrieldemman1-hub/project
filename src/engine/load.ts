import type {
  EngineExercise,
  LastExerciseSession,
  LoadAction,
  PerformedSet,
  Rir,
  Soreness,
} from './types'

/**
 * The top set: heaviest weight lifted, ties broken by most reps (PLAN §2.5).
 * This is the set the rep-floor rule judges and the set whose reps get chased.
 */
export function topSet(sets: readonly PerformedSet[]): PerformedSet {
  let best = sets[0]
  if (!best) throw new Error('topSet requires at least one set')
  for (const set of sets) {
    if (set.weightLb > best.weightLb) best = set
    else if (set.weightLb === best.weightLb && set.reps > best.reps) best = set
  }
  return best
}

export interface LoadDecision {
  weightLb: number
  action: LoadAction
  /** Set when the prescription is "same weight, beat N reps". */
  repsToBeat: number | null
  reasons: string[]
}

/**
 * The load rules from BRIEF Part 5, resolved in a fixed order (PLAN §6) so
 * they can never contradict each other:
 *
 *   1. RIR 3+ or 2 earns one increment; 1 and 0 hold.
 *   2. Top set below the rep floor forces a decrease — decision A-2, the hard
 *      override that beats everything, including the holds below.
 *   3. An earned increase is cancelled (never inverted) by: still sore, joint
 *      pain, or last session already having been an increase.
 *   4. On a hold with RIR 1 — or with no RIR reported at all — chase last
 *      session's top-set reps.
 */
export function loadDecision(
  exercise: EngineExercise,
  last: LastExerciseSession,
  soreness: Soreness | null,
): LoadDecision {
  const reasons: string[] = []
  const top = topSet(last.sets)
  const rir: Rir | null = last.rir

  let delta = 0
  if (rir === '3+' || rir === '2') {
    delta = 1
    reasons.push(`load:+1:rir-${rir}`)
  }

  if (top.reps < exercise.repTargetMin) {
    // A-2: hard evidence beats self-estimate. Nothing un-decreases this.
    delta = -1
    reasons.push(`load:-1:below-floor(${top.reps}<${exercise.repTargetMin})`)
  } else if (delta > 0) {
    if (soreness === 'still_sore') {
      delta = 0
      reasons.push('increase-blocked:still-sore')
    } else if (last.jointPain === true) {
      delta = 0
      reasons.push('increase-blocked:joint-pain')
    } else if (last.loadAction === 'increase') {
      delta = 0
      reasons.push('increase-blocked:consecutive')
    }
  }

  const increment = exercise.weightIncrementLb
  // Never below one increment: a machine stack has no zero pin.
  const weightLb = Math.max(increment, top.weightLb + delta * increment)
  const action: LoadAction = delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'hold'

  // Chasing reps: the explicit RIR-1 case, the conservative default when the
  // prompt was skipped, and the blocked consecutive increase — the brief says
  // that one "holds and chases reps instead". The other two blocks are
  // recovery holds (still sore, joint pain), where pushing for a rep PR would
  // defeat their purpose. RIR 0 repeats without a target.
  const chasing =
    action === 'hold' &&
    (rir === '1' || rir === null || reasons.includes('increase-blocked:consecutive'))
  if (chasing) reasons.push('load:hold:chase-reps')
  if (action === 'hold' && rir === '0') reasons.push('load:hold:repeat')

  return {
    weightLb,
    action,
    repsToBeat: chasing ? top.reps : null,
    reasons,
  }
}
