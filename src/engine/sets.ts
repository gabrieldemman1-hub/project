import type { Pump, Soreness } from './types'

export const MIN_SETS = 2
export const MAX_SETS = 5
/** Starting set count for a never-trained exercise (PLAN §2.5). */
export const FIRST_TIME_SETS = 3

/**
 * The set matrix from BRIEF Part 5, verbatim:
 *
 *              pump: low   moderate   great
 *  none          +2          +1        +1
 *  a little      +1           0         0
 *  still sore    −1          −1        −1
 *
 * Missing answers take the neutral middle of the matrix — "a little" sore,
 * "moderate" pump — which changes nothing. Skipping the prompts must never
 * punish or reward.
 */
const MATRIX: Record<Soreness, Record<Pump, number>> = {
  none: { low: 2, moderate: 1, great: 1 },
  a_little: { low: 1, moderate: 0, great: 0 },
  still_sore: { low: -1, moderate: -1, great: -1 },
}

export interface SetsDecision {
  delta: number
  reason: string
}

export function setsDelta(soreness: Soreness | null, pump: Pump | null): SetsDecision {
  const s = soreness ?? 'a_little'
  const p = pump ?? 'moderate'
  const delta = MATRIX[s][p]
  return {
    delta,
    reason: `sets:${s}×${p}=${delta >= 0 ? '+' : ''}${delta}`,
  }
}

export function clampSets(sets: number): number {
  return Math.min(MAX_SETS, Math.max(MIN_SETS, sets))
}
