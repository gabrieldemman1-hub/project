import { describe, expect, it } from 'vitest'

import {
  currentStreak,
  isRestDay,
  mesocyclePosition,
  templateForDate,
} from './schedule'
import type { DayTemplate, Mesocycle, Session, SessionStatus } from '../db/schema'

// Week of Monday 17 August 2026 is the reference week throughout these tests.
const MONDAY = '2026-08-17'

function template(letter: 'A' | 'B' | 'C', weekdays: number[]): DayTemplate {
  return {
    id: `day-${letter}`,
    letter,
    name: letter,
    weekdays,
    exerciseIds: [],
    sorenessPromptGroupIds: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

const TEMPLATES: DayTemplate[] = [
  template('A', [1, 4]),
  template('B', [2, 5]),
  template('C', [3, 6]),
]

function mesocycle(overrides: Partial<Mesocycle> = {}): Mesocycle {
  return {
    id: 'meso-1',
    startDate: MONDAY,
    totalWeeks: 6,
    deloadWeek: 6,
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function session(date: string, status: SessionStatus = 'completed'): Session {
  return {
    id: `session-${date}`,
    date,
    dayTemplateId: 'day-A',
    mesocycleId: 'meso-1',
    weekNumber: 1,
    isDeload: false,
    status,
    currentExerciseIndex: 0,
    cardio: null,
    startedAt: 0,
    completedAt: status === 'completed' ? 1 : null,
    updatedAt: 0,
  }
}

describe('templateForDate', () => {
  it('maps the six training days to the three-day rotation run twice', () => {
    const letters = [
      '2026-08-17', // Mon
      '2026-08-18', // Tue
      '2026-08-19', // Wed
      '2026-08-20', // Thu
      '2026-08-21', // Fri
      '2026-08-22', // Sat
    ].map((date) => templateForDate(TEMPLATES, date)?.letter)

    expect(letters).toEqual(['A', 'B', 'C', 'A', 'B', 'C'])
  })

  it('returns nothing on Sunday', () => {
    expect(templateForDate(TEMPLATES, '2026-08-16')).toBeNull()
    expect(isRestDay(TEMPLATES, '2026-08-16')).toBe(true)
  })

  it('keeps weekdays locked so a missed day does not shift the rotation', () => {
    // PLAN.md A-1: skipping Tuesday must not turn Wednesday into a Legs day.
    expect(templateForDate(TEMPLATES, '2026-08-19')?.letter).toBe('C')
  })
})

describe('mesocyclePosition', () => {
  it('reports week 1 on the first day of the block', () => {
    const position = mesocyclePosition(mesocycle(), MONDAY)
    expect(position.weekNumber).toBe(1)
    expect(position.isDeloadWeek).toBe(false)
    expect(position.isComplete).toBe(false)
  })

  it('holds the same week number across every day of that week', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = `2026-08-${17 + offset}`
      expect(mesocyclePosition(mesocycle(), date).weekNumber).toBe(1)
    }
  })

  it('advances a week on each following Monday', () => {
    expect(mesocyclePosition(mesocycle(), '2026-08-24').weekNumber).toBe(2)
    expect(mesocyclePosition(mesocycle(), '2026-08-31').weekNumber).toBe(3)
    expect(mesocyclePosition(mesocycle(), '2026-09-07').weekNumber).toBe(4)
    expect(mesocyclePosition(mesocycle(), '2026-09-14').weekNumber).toBe(5)
  })

  it('flags week 6 as the deload', () => {
    const position = mesocyclePosition(mesocycle(), '2026-09-21')
    expect(position.weekNumber).toBe(6)
    expect(position.isDeloadWeek).toBe(true)
    expect(position.isComplete).toBe(false)
  })

  it('reports the block complete past week 6 rather than rolling over', () => {
    // PLAN.md A-4: the next block is started by hand, never automatically.
    const position = mesocyclePosition(mesocycle(), '2026-09-28')
    expect(position.isComplete).toBe(true)
    expect(position.isDeloadWeek).toBe(false)
    expect(position.weekNumber).toBe(6)
  })

  it('clamps to week 1 for a date before the block started', () => {
    expect(mesocyclePosition(mesocycle(), '2026-08-10').weekNumber).toBe(1)
  })
})

describe('currentStreak', () => {
  it('is zero with no completed sessions', () => {
    expect(currentStreak(TEMPLATES, [], '2026-08-22')).toBe(0)
  })

  it('counts consecutive completed training days', () => {
    const sessions = [
      session('2026-08-17'),
      session('2026-08-18'),
      session('2026-08-19'),
    ]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-19')).toBe(3)
  })

  it('steps over Sunday instead of breaking on it', () => {
    // Sat 15th and Mon 17th, with the rest day in between, is a run of 2.
    const sessions = [session('2026-08-15'), session('2026-08-17')]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-17')).toBe(2)
  })

  it('breaks on a skipped session', () => {
    const sessions = [
      session('2026-08-17'),
      session('2026-08-18', 'skipped'),
      session('2026-08-19'),
    ]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-19')).toBe(1)
  })

  it('breaks on a training day with no session at all', () => {
    const sessions = [session('2026-08-17'), session('2026-08-19')]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-19')).toBe(1)
  })

  it('does not count an in-progress session as completed', () => {
    const sessions = [session('2026-08-17'), session('2026-08-18', 'in_progress')]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-18')).toBe(1)
  })

  it('breaks immediately when today is the day that was skipped', () => {
    // Deciding to skip is a decision; not having trained yet is not. The grace
    // given to an unlogged today must not extend to a day explicitly skipped.
    const sessions = [
      session('2026-08-17'),
      session('2026-08-18'),
      session('2026-08-19', 'skipped'),
    ]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-19')).toBe(0)
  })

  it('still grants the grace when today is merely in progress', () => {
    const sessions = [
      session('2026-08-17'),
      session('2026-08-18'),
      session('2026-08-19', 'in_progress'),
    ]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-19')).toBe(2)
  })

  it('breaks when yesterday was skipped and today is a rest day', () => {
    const sessions = [session('2026-08-21'), session('2026-08-22', 'skipped')]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-23')).toBe(0)
  })

  it('survives today not being logged yet', () => {
    // Standing in the gym on Wednesday before starting, the streak should still
    // show Monday and Tuesday rather than dropping to zero.
    const sessions = [session('2026-08-17'), session('2026-08-18')]
    expect(currentStreak(TEMPLATES, sessions, '2026-08-19')).toBe(2)
  })
})
