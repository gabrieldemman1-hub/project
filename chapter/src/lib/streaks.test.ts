import { describe, expect, it } from 'vitest'
import { readingStreak, reviewStreak, type DayStamped } from './streaks'

const days = (...ds: string[]): DayStamped[] => ds.map((dayKey) => ({ dayKey }))

const TODAY = '2026-08-18'
const YESTERDAY = '2026-08-17'

describe('readingStreak — the loud one', () => {
  it('first day: reading today is a streak of one', () => {
    const s = readingStreak(days(TODAY), TODAY)
    expect(s.current).toBe(1)
    expect(s.longest).toBe(1)
    expect(s.doneToday).toBe(true)
    expect(s.status).toBe('active')
    expect(s.lastDay).toBe(TODAY)
  })

  it('consecutive days accumulate', () => {
    const s = readingStreak(days('2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', TODAY), TODAY)
    expect(s.current).toBe(5)
    expect(s.longest).toBe(5)
  })

  it('a streak ending YESTERDAY is still alive — the app must not show 0 every morning', () => {
    const s = readingStreak(days('2026-08-15', '2026-08-16', YESTERDAY), TODAY)
    expect(s.current).toBe(3)
    expect(s.doneToday).toBe(false)
    expect(s.status).toBe('at_risk')
    expect(s.lastDay).toBe(YESTERDAY)
  })

  it('one missed day breaks it', () => {
    // Read through the 16th, skipped the 17th, read today.
    const s = readingStreak(days('2026-08-15', '2026-08-16', TODAY), TODAY)
    expect(s.current).toBe(1)
    expect(s.longest).toBe(2)
    expect(s.doneToday).toBe(true)
  })

  it('two missed days leave nothing alive', () => {
    const s = readingStreak(days('2026-08-14', '2026-08-15'), TODAY)
    expect(s.current).toBe(0)
    expect(s.longest).toBe(2)
    expect(s.status).toBe('broken')
    expect(s.doneToday).toBe(false)
  })

  it('logging twice in one day counts as one day', () => {
    const s = readingStreak(days(YESTERDAY, TODAY, TODAY, TODAY), TODAY)
    expect(s.current).toBe(2)
    expect(s.longest).toBe(2)
  })

  it('does not care what order the logs arrive in', () => {
    const shuffled = days(TODAY, '2026-08-15', YESTERDAY, '2026-08-16')
    expect(readingStreak(shuffled, TODAY).current).toBe(4)
  })

  it('crosses a month boundary', () => {
    const s = readingStreak(days('2026-07-30', '2026-07-31', '2026-08-01'), '2026-08-01')
    expect(s.current).toBe(3)
  })

  it('crosses a spring-forward DST transition without losing a day', () => {
    const s = readingStreak(days('2026-03-07', '2026-03-08', '2026-03-09'), '2026-03-09')
    expect(s.current).toBe(3)
  })

  it('empty history is zero, not NaN', () => {
    const s = readingStreak([], TODAY)
    expect(s).toEqual({
      current: 0,
      longest: 0,
      lastDay: null,
      doneToday: false,
      status: 'broken',
    })
  })

  it('a single day far in the past is dead but still counts toward longest', () => {
    const s = readingStreak(days('2025-01-01'), TODAY)
    expect(s.current).toBe(0)
    expect(s.longest).toBe(1)
    expect(s.lastDay).toBe('2025-01-01')
  })

  it('finds the longest run when it is not the current one', () => {
    const s = readingStreak(
      days('2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-17', TODAY),
      TODAY,
    )
    expect(s.current).toBe(2)
    expect(s.longest).toBe(4)
  })

  it('IGNORES future-dated entries — they must never bridge a real gap', () => {
    // A clock-skewed row dated tomorrow must not join up a broken streak.
    const s = readingStreak(days('2026-08-15', '2026-08-19', '2026-08-20'), TODAY)
    expect(s.current).toBe(0)
    expect(s.longest).toBe(1)
    expect(s.lastDay).toBe('2026-08-15')
  })

  it('never reports a longest shorter than the current', () => {
    const s = readingStreak(days(YESTERDAY, TODAY), TODAY)
    expect(s.longest).toBeGreaterThanOrEqual(s.current)
  })

  it('is pure — the same input twice gives the same answer, and the input is untouched', () => {
    const input = days('2026-08-16', YESTERDAY, TODAY)
    const copy = JSON.parse(JSON.stringify(input))
    const a = readingStreak(input, TODAY)
    const b = readingStreak(input, TODAY)
    expect(a).toEqual(b)
    expect(input).toEqual(copy)
  })
})

describe('reviewStreak — the quiet one', () => {
  it('counts closed sessions', () => {
    const s = reviewStreak(days('2026-08-16', YESTERDAY, TODAY), TODAY)
    expect(s.current).toBe(3)
    expect(s.doneToday).toBe(true)
  })

  it('a night with NOTHING DUE bridges the streak without inflating it', () => {
    // Reviewed the 15th and 17th; on the 16th the scheduler had nothing to give.
    const s = reviewStreak(days('2026-08-15', '2026-08-17'), '2026-08-17', ['2026-08-16'])
    expect(s.current).toBe(2)
    expect(s.longest).toBe(2)
  })

  it('an exempt night today counts as done without adding to the count', () => {
    const s = reviewStreak(days('2026-08-16', YESTERDAY), TODAY, [TODAY])
    expect(s.doneToday).toBe(true)
    expect(s.status).toBe('active')
    expect(s.current).toBe(2)
  })

  it('without the exemption the same history would look broken', () => {
    const s = reviewStreak(days('2026-08-15', '2026-08-17'), '2026-08-17')
    expect(s.current).toBe(1)
  })

  it('exempt days in the future are ignored like any other future entry', () => {
    const s = reviewStreak(days(TODAY), TODAY, ['2026-08-19'])
    expect(s.current).toBe(1)
  })
})

describe('the two streaks cannot contaminate each other', () => {
  it('a night of reviews does not extend the reading streak', () => {
    const readingLogs = days('2026-08-15', '2026-08-16')
    const reviewSessions = days('2026-08-17', TODAY)
    // Reading stopped on the 16th. Reviews continued. The reading streak is dead.
    expect(readingStreak(readingLogs, TODAY).current).toBe(0)
    expect(reviewStreak(reviewSessions, TODAY).current).toBe(2)
  })

  it('skipping the night session leaves the reading streak untouched', () => {
    const readingLogs = days('2026-08-15', '2026-08-16', '2026-08-17', TODAY)
    expect(readingStreak(readingLogs, TODAY).current).toBe(4)
    expect(reviewStreak([], TODAY).current).toBe(0)
  })

  it('a review session cannot be handed to the reading streak as a reading log', () => {
    // Both take DayStamped, so the type system alone will not stop a future
    // refactor that merges the tables. This pins the behaviour instead: the
    // reading streak's answer depends only on what it was given.
    const reading = days('2026-08-15', '2026-08-16', '2026-08-17', TODAY)
    const before = readingStreak(reading, TODAY)
    // Reviews happening on every one of those days changes nothing.
    reviewStreak(days('2026-08-15', '2026-08-16', '2026-08-17', TODAY), TODAY)
    expect(readingStreak(reading, TODAY)).toEqual(before)
  })
})
