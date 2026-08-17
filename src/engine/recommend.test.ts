import { describe, expect, it } from 'vitest'

import { recommend } from './recommend'
import type {
  ExerciseHistoryInput,
  LastExerciseSession,
  Pump,
  Soreness,
} from './types'

/**
 * Written from BRIEF Part 5 and PLAN §6/A-2/A-3 before the implementation.
 * Every cell of the set matrix, every RIR case, the consecutive-increase
 * guard, the below-floor override, joint pain, both clamps, deload rounding,
 * the first-ever session, and skipped feedback.
 */

const EXERCISE = { repTargetMin: 8, repTargetMax: 12, weightIncrementLb: 5 }

function last(overrides: Partial<LastExerciseSession> = {}): LastExerciseSession {
  return {
    sets: [
      { weightLb: 150, reps: 10 },
      { weightLb: 150, reps: 9 },
      { weightLb: 150, reps: 8 },
    ],
    pump: 'moderate',
    rir: '1',
    jointPain: null,
    loadAction: 'hold',
    ...overrides,
  }
}

function input(overrides: Partial<ExerciseHistoryInput> = {}): ExerciseHistoryInput {
  return {
    exercise: EXERCISE,
    soreness: 'a_little',
    last: last(),
    isDeload: false,
    ...overrides,
  }
}

describe('set progression — every cell of the matrix (BRIEF Part 5)', () => {
  // Base: 3 sets performed last time. Matrix rows are soreness, columns pump.
  const cases: Array<[Soreness, Pump, number]> = [
    ['none', 'low', +2],
    ['none', 'moderate', +1],
    ['none', 'great', +1],
    ['a_little', 'low', +1],
    ['a_little', 'moderate', 0],
    ['a_little', 'great', 0],
    ['still_sore', 'low', -1],
    ['still_sore', 'moderate', -1],
    ['still_sore', 'great', -1],
  ]

  for (const [soreness, pump, delta] of cases) {
    it(`soreness ${soreness} × pump ${pump} → ${delta >= 0 ? '+' : ''}${delta} sets`, () => {
      const result = recommend(input({ soreness, last: last({ pump }) }))
      expect(result.sets).toBe(3 + delta)
    })
  }

  it('clamps at 5 sets maximum', () => {
    const sets = Array.from({ length: 4 }, () => ({ weightLb: 150, reps: 10 }))
    const result = recommend(input({ soreness: 'none', last: last({ pump: 'low', sets }) }))
    expect(result.sets).toBe(5) // 4 + 2 clamped
  })

  it('clamps at 2 sets minimum', () => {
    const sets = [
      { weightLb: 150, reps: 10 },
      { weightLb: 150, reps: 9 },
    ]
    const result = recommend(input({ soreness: 'still_sore', last: last({ sets }) }))
    expect(result.sets).toBe(2) // 2 - 1 clamped
  })
})

describe('load progression — every RIR case', () => {
  it('RIR 3+ → one increment up, same rep target', () => {
    const result = recommend(input({ last: last({ rir: '3+' }) }))
    expect(result.weightLb).toBe(155)
    expect(result.loadAction).toBe('increase')
    expect(result.repTargetMin).toBe(8)
    expect(result.repTargetMax).toBe(12)
    expect(result.repsToBeat).toBeNull()
  })

  it('RIR 2 → one increment up', () => {
    const result = recommend(input({ last: last({ rir: '2' }) }))
    expect(result.weightLb).toBe(155)
    expect(result.loadAction).toBe('increase')
  })

  it('RIR 1 → same weight, beat last session’s top-set reps', () => {
    const result = recommend(input({ last: last({ rir: '1' }) }))
    expect(result.weightLb).toBe(150)
    expect(result.loadAction).toBe('hold')
    expect(result.repsToBeat).toBe(10)
  })

  it('RIR 0 → same weight, same reps, nothing to beat', () => {
    const result = recommend(input({ last: last({ rir: '0' }) }))
    expect(result.weightLb).toBe(150)
    expect(result.loadAction).toBe('hold')
    expect(result.repsToBeat).toBeNull()
  })

  it('uses the exercise’s own increment, not a hardcoded 5', () => {
    const result = recommend(
      input({
        exercise: { ...EXERCISE, weightIncrementLb: 15 },
        last: last({ rir: '3+' }),
      }),
    )
    expect(result.weightLb).toBe(165)
  })
})

describe('the top set', () => {
  it('is the heaviest set, ties broken by most reps (PLAN §2.5)', () => {
    const sets = [
      { weightLb: 180, reps: 12 },
      { weightLb: 185, reps: 7 },
      { weightLb: 185, reps: 9 },
    ]
    const result = recommend(input({ last: last({ sets, rir: '1' }) }))
    // Beat the 185×9, not the 185×7 and not the lighter 180×12.
    expect(result.repsToBeat).toBe(9)
  })
})

describe('never increase twice in a row', () => {
  it('holds and chases reps when last session was an increase', () => {
    const result = recommend(input({ last: last({ rir: '3+', loadAction: 'increase' }) }))
    expect(result.weightLb).toBe(150)
    expect(result.loadAction).toBe('hold')
    expect(result.repsToBeat).toBe(10)
    expect(result.reasons).toContain('increase-blocked:consecutive')
  })

  it('a decrease last session does not block an increase', () => {
    const result = recommend(input({ last: last({ rir: '2', loadAction: 'decrease' }) }))
    expect(result.loadAction).toBe('increase')
  })

  it('is enforced across chained sessions — increases alternate at best', () => {
    // Simulate five keen sessions all reporting RIR 3+; the engine's own
    // recorded loadAction feeds the next call, so increases can never stack.
    let action: 'increase' | 'hold' | 'decrease' = 'hold'
    const actions: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const result = recommend(input({ last: last({ rir: '3+', loadAction: action }) }))
      actions.push(result.loadAction)
      action = result.loadAction
    }
    expect(actions).toEqual(['increase', 'hold', 'increase', 'hold', 'increase'])
  })
})

describe('below the rep floor (decision A-2: it beats every other load rule)', () => {
  it('drops one increment when the top set missed the floor', () => {
    const sets = [{ weightLb: 150, reps: 6 }]
    const result = recommend(input({ last: last({ sets, rir: '1' }) }))
    expect(result.weightLb).toBe(145)
    expect(result.loadAction).toBe('decrease')
  })

  it('beats a reported RIR 3+', () => {
    const sets = [{ weightLb: 150, reps: 6 }]
    const result = recommend(input({ last: last({ sets, rir: '3+' }) }))
    expect(result.weightLb).toBe(145)
    expect(result.loadAction).toBe('decrease')
  })

  it('beats joint pain’s hold', () => {
    const sets = [{ weightLb: 150, reps: 6 }]
    const result = recommend(input({ last: last({ sets, rir: '1', jointPain: true }) }))
    expect(result.loadAction).toBe('decrease')
  })

  it('beats still-sore’s hold, which still drops a set', () => {
    const sets = [
      { weightLb: 150, reps: 6 },
      { weightLb: 150, reps: 6 },
      { weightLb: 150, reps: 6 },
    ]
    const result = recommend(input({ soreness: 'still_sore', last: last({ sets, rir: '1' }) }))
    expect(result.weightLb).toBe(145)
    expect(result.sets).toBe(2)
  })

  it('exactly the floor is not below it', () => {
    const sets = [{ weightLb: 150, reps: 8 }]
    const result = recommend(input({ last: last({ sets, rir: '2' }) }))
    expect(result.loadAction).toBe('increase')
  })

  it('never prescribes below one increment', () => {
    const sets = [{ weightLb: 5, reps: 4 }]
    const result = recommend(input({ last: last({ sets, rir: '0' }) }))
    expect(result.weightLb).toBe(5)
  })
})

describe('joint pain', () => {
  it('blocks an increase the exercise otherwise earned', () => {
    const result = recommend(input({ last: last({ rir: '3+', jointPain: true }) }))
    expect(result.weightLb).toBe(150)
    expect(result.loadAction).toBe('hold')
    expect(result.reasons).toContain('increase-blocked:joint-pain')
  })

  it('does not touch the set count', () => {
    const result = recommend(input({ soreness: 'none', last: last({ pump: 'low', jointPain: true }) }))
    expect(result.sets).toBe(5)
  })
})

describe('still sore overrides load', () => {
  it('holds load even on RIR 2, and drops a set', () => {
    const result = recommend(input({ soreness: 'still_sore', last: last({ rir: '2' }) }))
    expect(result.weightLb).toBe(150)
    expect(result.loadAction).toBe('hold')
    expect(result.sets).toBe(2)
  })
})

describe('deload (week six) — decisions A-3', () => {
  it('halves sets rounding down, minimum 2, drops 10% to the nearest increment', () => {
    const sets = Array.from({ length: 5 }, () => ({ weightLb: 150, reps: 10 }))
    const result = recommend(input({ isDeload: true, last: last({ sets }) }))
    expect(result.sets).toBe(2) // floor(5/2)
    expect(result.weightLb).toBe(135) // 150 × 0.9 = 135 exactly
    expect(result.targetRir).toBe(4)
    expect(result.loadAction).toBe('hold')
  })

  it('rounds −10% to the NEAREST increment, ties down (A-3)', () => {
    // 145 × 0.9 = 130.5 → equidistant between 130 and 135 → down to 130.
    const sets = [{ weightLb: 145, reps: 10 }]
    const result = recommend(input({ isDeload: true, last: last({ sets }) }))
    expect(result.weightLb).toBe(130)
  })

  it('rounds up when nearest is up', () => {
    // 155 × 0.9 = 139.5 → nearest pin at 5 lb is 140.
    const sets = [{ weightLb: 155, reps: 10 }]
    const result = recommend(input({ isDeload: true, last: last({ sets }) }))
    expect(result.weightLb).toBe(140)
  })

  it('never deloads below 2 sets', () => {
    const sets = Array.from({ length: 3 }, () => ({ weightLb: 150, reps: 10 }))
    const result = recommend(input({ isDeload: true, last: last({ sets }) }))
    expect(result.sets).toBe(2) // floor(3/2) = 1, clamped up
  })

  it('ignores feedback entirely — no progression on a deload', () => {
    const result = recommend(
      input({ isDeload: true, soreness: 'none', last: last({ pump: 'low', rir: '3+' }) }),
    )
    expect(result.loadAction).toBe('hold')
    expect(result.sets).toBe(2) // floor(3/2) = 1 → 2, matrix never applied
  })
})

describe('the first time an exercise is trained', () => {
  it('prescribes 3 sets and no weight — the user picks it once (PLAN §2.5)', () => {
    const result = recommend(input({ last: null, soreness: null }))
    expect(result.sets).toBe(3)
    expect(result.weightLb).toBeNull()
    expect(result.loadAction).toBe('hold')
    expect(result.sentence.length).toBeGreaterThan(0)
  })
})

describe('skipped feedback degrades gracefully', () => {
  it('no soreness and no pump → set count unchanged', () => {
    const result = recommend(input({ soreness: null, last: last({ pump: null }) }))
    expect(result.sets).toBe(3)
  })

  it('no RIR → holds weight and chases last session’s reps', () => {
    const result = recommend(input({ last: last({ rir: null }) }))
    expect(result.weightLb).toBe(150)
    expect(result.loadAction).toBe('hold')
    expect(result.repsToBeat).toBe(10)
  })
})

describe('the sentence', () => {
  it('always exists, is one sentence, and mentions the load change on an increase', () => {
    const result = recommend(input({ last: last({ rir: '3+' }) }))
    expect(result.sentence).toMatch(/5 lb/)
    expect(result.sentence.split('. ').length).toBe(1)
  })

  it('names the reps to beat when chasing reps', () => {
    const result = recommend(input({ last: last({ rir: '1' }) }))
    expect(result.sentence).toMatch(/beat/i)
    expect(result.sentence).toMatch(/10/)
  })

  it('explains a blocked increase rather than just holding silently', () => {
    const result = recommend(input({ last: last({ rir: '3+', loadAction: 'increase' }) }))
    expect(result.sentence).toMatch(/last session|in a row/i)
  })
})

describe('purity', () => {
  it('same input, same output — and the input is never mutated', () => {
    const a = input({ last: last({ rir: '2' }) })
    const frozen = JSON.parse(JSON.stringify(a)) as ExerciseHistoryInput
    const first = recommend(a)
    const second = recommend(a)
    expect(first).toEqual(second)
    expect(a).toEqual(frozen)
  })
})
