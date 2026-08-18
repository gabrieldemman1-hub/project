import { describe, expect, it } from 'vitest'
import {
  INTERVALS,
  buildSession,
  describeInterval,
  firstReview,
  nextReview,
  soonestDue,
  type PendingReview,
} from './scheduler'
import { addDays, diffDays } from './day'

const CREATED = '2026-08-18'

const pending = (
  id: string,
  dueDate: string,
  intervalIndex = 0,
  noteId = `nt_${id}`,
): PendingReview => ({ id, noteId, dueDate, intervalIndex })

describe('INTERVALS', () => {
  it('is the ladder from the brief', () => {
    expect([...INTERVALS]).toEqual([1, 3, 7, 14, 30])
  })

  it('sums to 55 — this is what pins the ladder to the brief’s own test', () => {
    expect(INTERVALS.reduce((a, b) => a + b, 0)).toBe(55)
  })
})

describe('firstReview', () => {
  it('schedules tomorrow, at the bottom of the ladder', () => {
    const r = firstReview(CREATED)
    expect(r.intervalIndex).toBe(0)
    expect(r.dueDate).toBe('2026-08-19')
    expect(r.intervalDays).toBe(1)
  })

  it('means a note written this morning is never reviewed tonight', () => {
    // Deliberate. Retrieval an hour after encoding is not spaced repetition.
    expect(firstReview(CREATED).dueDate).not.toBe(CREATED)
  })
})

describe('nextReview — the three grades', () => {
  it('got it advances one rung', () => {
    const r = nextReview({ intervalIndex: 0 }, 'got_it', '2026-08-19')
    expect(r.intervalIndex).toBe(1)
    expect(r.intervalDays).toBe(3)
    expect(r.dueDate).toBe('2026-08-22')
  })

  it('partial repeats the same rung', () => {
    const r = nextReview({ intervalIndex: 2 }, 'partial', '2026-08-19')
    expect(r.intervalIndex).toBe(2)
    expect(r.intervalDays).toBe(7)
    expect(r.dueDate).toBe('2026-08-26')
  })

  it('missed drops all the way back to tomorrow', () => {
    const r = nextReview({ intervalIndex: 4 }, 'missed', '2026-08-19')
    expect(r.intervalIndex).toBe(0)
    expect(r.intervalDays).toBe(1)
    expect(r.dueDate).toBe('2026-08-20')
  })

  it('clamps at the top of the ladder rather than inventing a sixth interval', () => {
    const r = nextReview({ intervalIndex: 4 }, 'got_it', '2026-08-19')
    expect(r.intervalIndex).toBe(4)
    expect(r.intervalDays).toBe(30)
  })

  it('is always due strictly after the day it was reviewed', () => {
    for (const grade of ['got_it', 'partial', 'missed'] as const) {
      for (let i = 0; i <= 4; i++) {
        const r = nextReview({ intervalIndex: i }, grade, '2026-08-19')
        expect(diffDays('2026-08-19', r.dueDate)).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the index inside the ladder however it is abused', () => {
    for (const bad of [-3, -1, 5, 99, Number.NaN]) {
      for (const grade of ['got_it', 'partial', 'missed'] as const) {
        const r = nextReview({ intervalIndex: bad }, grade, '2026-08-19')
        expect(r.intervalIndex).toBeGreaterThanOrEqual(0)
        expect(r.intervalIndex).toBeLessThanOrEqual(4)
      }
    }
  })

  it('explains itself in one short sentence, every time', () => {
    for (const grade of ['got_it', 'partial', 'missed'] as const) {
      for (let i = 0; i <= 4; i++) {
        const s = nextReview({ intervalIndex: i }, grade, '2026-08-19').sentence
        expect(s.length).toBeGreaterThan(0)
        expect(s.length).toBeLessThan(90)
      }
    }
  })
})

describe('the full ladder — the brief’s own test', () => {
  it('walks a note to 55 days out, always graded correctly', () => {
    // The brief says "graded correctly five times, is due 55 days out".
    // 1 + 3 + 7 + 14 + 30 = 55, so the intervals are gaps between reviews.
    // Creation schedules review 1; four correct grades schedule reviews 2-5.
    const dueDays: number[] = []

    let review = firstReview(CREATED)
    dueDays.push(diffDays(CREATED, review.dueDate))

    for (let i = 0; i < 4; i++) {
      review = nextReview({ intervalIndex: review.intervalIndex }, 'got_it', review.dueDate)
      dueDays.push(diffDays(CREATED, review.dueDate))
    }

    expect(dueDays).toEqual([1, 4, 11, 25, 55])
    expect(dueDays.at(-1)).toBe(55)
  })

  it('stays monthly forever once it reaches the top', () => {
    let review = { intervalIndex: 4, dueDate: '2026-08-19' }
    for (let i = 0; i < 6; i++) {
      const next = nextReview(review, 'got_it', review.dueDate)
      expect(next.intervalDays).toBe(30)
      review = { intervalIndex: next.intervalIndex, dueDate: next.dueDate }
    }
  })
})

describe('reviewing late', () => {
  it('measures the next interval from the day you ACTUALLY reviewed', () => {
    // Due the 19th, reviewed the 28th — nine days late.
    const r = nextReview({ intervalIndex: 0 }, 'got_it', '2026-08-28')
    expect(r.dueDate).toBe('2026-08-31')
  })

  it('so a note does not stay overdue after the work is done', () => {
    const reviewedOn = '2026-08-28'
    for (const grade of ['got_it', 'partial', 'missed'] as const) {
      const r = nextReview({ intervalIndex: 1 }, grade, reviewedOn)
      expect(r.dueDate > reviewedOn).toBe(true)
    }
  })
})

describe('missing a note repeatedly does not spiral', () => {
  it('resets to exactly tomorrow every time, forever', () => {
    let state = { intervalIndex: 3 }
    let day = '2026-08-19'
    for (let i = 0; i < 5; i++) {
      const r = nextReview(state, 'missed', day)
      expect(r.intervalIndex).toBe(0)
      expect(r.dueDate).toBe(addDays(day, 1))
      state = { intervalIndex: r.intervalIndex }
      day = r.dueDate
    }
  })

  it('never schedules a note back into the day it was just graded', () => {
    // The precise statement of "doesn't spiral": grading always removes work
    // from today and can never add any.
    const today = '2026-08-19'
    for (const grade of ['got_it', 'partial', 'missed'] as const) {
      for (let i = 0; i <= 4; i++) {
        expect(nextReview({ intervalIndex: i }, grade, today).dueDate > today).toBe(true)
      }
    }
  })
})

describe('buildSession', () => {
  const TODAY = '2026-08-18'

  it('serves nothing when nothing is due', () => {
    const s = buildSession([pending('a', '2026-08-25')], TODAY, 5)
    expect(s.nothingDue).toBe(true)
    expect(s.queue).toEqual([])
    expect(s.dueCount).toBe(0)
  })

  it('never pulls a future note forward', () => {
    const s = buildSession([pending('a', '2026-08-19'), pending('b', TODAY)], TODAY, 5)
    expect(s.queue.map((r) => r.id)).toEqual(['b'])
  })

  it('puts the most overdue note first', () => {
    const s = buildSession(
      [pending('recent', TODAY), pending('ancient', '2026-08-01'), pending('mid', '2026-08-10')],
      TODAY,
      5,
    )
    expect(s.queue.map((r) => r.id)).toEqual(['ancient', 'mid', 'recent'])
    expect(s.overdueCount).toBe(2)
  })

  it('breaks ties by weakest note first, then by id, so the order is total', () => {
    const s = buildSession(
      [pending('c', TODAY, 3), pending('a', TODAY, 1), pending('b', TODAY, 1)],
      TODAY,
      5,
    )
    expect(s.queue.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('caps at five and says what it held back', () => {
    const due = Array.from({ length: 40 }, (_, i) =>
      pending(`n${String(i).padStart(2, '0')}`, '2026-08-10'),
    )
    const s = buildSession(due, TODAY, 5)
    expect(s.queue).toHaveLength(5)
    expect(s.dueCount).toBe(40)
    expect(s.heldBack).toBe(35)
    expect(s.nothingDue).toBe(false)
  })

  it('is deterministic — the same 40 notes give the same 5 every time', () => {
    const due = Array.from({ length: 40 }, (_, i) => pending(`n${i}`, '2026-08-10'))
    const a = buildSession(due, TODAY, 5).queue.map((r) => r.id)
    const b = buildSession([...due].reverse(), TODAY, 5).queue.map((r) => r.id)
    expect(a).toEqual(b)
  })

  it('does not mutate the array it was given', () => {
    const due = [pending('b', TODAY), pending('a', '2026-08-01')]
    const copy = JSON.parse(JSON.stringify(due))
    buildSession(due, TODAY, 5)
    expect(due).toEqual(copy)
  })

  it('handles a cap of zero without dividing by anything', () => {
    const s = buildSession([pending('a', TODAY)], TODAY, 0)
    expect(s.queue).toEqual([])
    expect(s.heldBack).toBe(1)
  })

  it('an empty shelf is nothingDue, not an error', () => {
    expect(buildSession([], TODAY, 5).nothingDue).toBe(true)
  })
})

describe('soonestDue — reviewing early on purpose', () => {
  const TODAY = '2026-08-18'

  it('pulls the next notes up regardless of their date', () => {
    const q = soonestDue(
      [pending('far', '2026-10-01'), pending('near', '2026-08-20'), pending('mid', '2026-09-01')],
      TODAY,
      2,
    )
    expect(q.map((r) => r.id)).toEqual(['near', 'mid'])
  })

  it('returns nothing when there is genuinely nothing left', () => {
    expect(soonestDue([], TODAY, 5)).toEqual([])
  })
})

describe('describeInterval', () => {
  it('reads like a person wrote it', () => {
    expect(describeInterval(1)).toBe('tomorrow')
    expect(describeInterval(3)).toBe('in 3 days')
    expect(describeInterval(30)).toBe('in a month')
  })
})
