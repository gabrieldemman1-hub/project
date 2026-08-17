import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import { completeSession, saveSet, skipToday, startSession } from './mutations'
import { getDashboardView } from './queries'
import { seedIfEmpty } from './seed'

/**
 * The dashboard's week board and block strip: the numbers the front door
 * shows before anyone taps into a workout. Getting these wrong is quiet —
 * nothing crashes, the week just misreports what happened — so they are
 * tested against the real rotation (Mon/Thu A, Tue/Fri B, Wed/Sat C, Sunday
 * off) rather than a stub.
 */

const CARDIO = { durationMin: 45, inclinePct: 10, speedMph: 3 }

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedIfEmpty(new Date(2026, 7, 16))
})

async function dayAIds(): Promise<string[]> {
  const template = await db.dayTemplates.where('letter').equals('A').first()
  if (!template) throw new Error('no Day A')
  return template.exerciseIds
}

describe('getDashboardView — the week board', () => {
  it('runs Monday to Sunday of the week containing the date', async () => {
    const view = await getDashboardView('2026-08-19')

    expect(view.week.map((day) => day.date)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ])
    expect(view.week.map((day) => day.weekdayShort)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ])
    // The locked rotation, and Sunday off.
    expect(view.week.map((day) => day.letter)).toEqual([
      'A',
      'B',
      'C',
      'A',
      'B',
      'C',
      null,
    ])
    expect(view.week[6]?.status).toBe('rest')
    expect(view.week[6]?.exerciseCount).toBe(0)
    expect(view.week[0]?.exerciseCount).toBeGreaterThan(0)
  })

  it('marks today, and only today, as today', async () => {
    const view = await getDashboardView('2026-08-19')
    expect(view.week.filter((day) => day.isToday).map((day) => day.date)).toEqual([
      '2026-08-19',
    ])
    expect(view.week[2]?.status).toBe('today')
  })

  it('reports each day as completed, skipped, in progress, missed or upcoming', async () => {
    const [pressId] = await dayAIds()
    if (!pressId) throw new Error('no press')

    const monday = await startSession('2026-08-17')
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
    await completeSession(monday.id, CARDIO)

    await skipToday('2026-08-18')

    // Wednesday is left untouched and Thursday is under way.
    const thursday = await startSession('2026-08-20')
    await saveSet({ sessionId: thursday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 9 })

    // Looking from Friday: Wednesday came and went with nothing logged.
    const view = await getDashboardView('2026-08-21')
    expect(view.week.map((day) => day.status)).toEqual([
      'completed',
      'skipped',
      'missed',
      'in_progress',
      'today',
      'upcoming',
      'rest',
    ])
  })

  it('never calls a future rest day missed', async () => {
    // Sunday is ahead of Friday, but it is a rest day, not a missed one.
    const view = await getDashboardView('2026-08-21')
    expect(view.week[6]?.status).toBe('rest')

    // And a rest day already in the past stays rest.
    const later = await getDashboardView('2026-08-25')
    expect(later.week[6]?.status).toBe('rest')
  })

  it('counts only completed sessions in the week totals', async () => {
    const [pressId, flatId] = await dayAIds()
    if (!pressId || !flatId) throw new Error('no exercises')

    const monday = await startSession('2026-08-17')
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 1, weightLb: 185, reps: 8 })
    await saveSet({ sessionId: monday.id, exerciseId: flatId, setIndex: 0, weightLb: 150, reps: 12 })
    await completeSession(monday.id, CARDIO)

    // An unfinished Tuesday contributes nothing, even though its set is saved.
    const tuesday = await startSession('2026-08-18')
    await saveSet({ sessionId: tuesday.id, exerciseId: pressId, setIndex: 0, weightLb: 999, reps: 99 })

    const view = await getDashboardView('2026-08-19')
    expect(view.weekTotals).toEqual({
      sessions: 1,
      sets: 3,
      volumeLb: 185 * 10 + 185 * 8 + 150 * 12,
    })
    expect(view.week[0]?.setsLogged).toBe(3)
  })

  it('counts only finished sessions on the block itself', async () => {
    const [pressId] = await dayAIds()
    if (!pressId) throw new Error('no press')

    const monday = await startSession('2026-08-17')
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
    await completeSession(monday.id, CARDIO)
    await skipToday('2026-08-18')

    // Two session rows exist, but only one was trained.
    expect(await db.sessions.count()).toBe(2)
    const view = await getDashboardView('2026-08-19')
    expect(view.activeBlock?.sessionCount).toBe(1)
  })

  it('leaves last week out of this week', async () => {
    const [pressId] = await dayAIds()
    if (!pressId) throw new Error('no press')

    const monday = await startSession('2026-08-17')
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
    await completeSession(monday.id, CARDIO)

    const nextWeek = await getDashboardView('2026-08-26')
    expect(nextWeek.week[0]?.date).toBe('2026-08-24')
    expect(nextWeek.weekTotals).toEqual({ sessions: 0, sets: 0, volumeLb: 0 })
  })
})

describe('getDashboardView — the block strip', () => {
  it('has one segment per week, with the deload marked', async () => {
    const view = await getDashboardView('2026-08-19')
    const meso = await db.mesocycles.toCollection().first()
    if (!meso) throw new Error('no mesocycle')

    expect(view.blockWeeks).toHaveLength(meso.totalWeeks)
    expect(view.blockWeeks.map((week) => week.week)).toEqual(
      Array.from({ length: meso.totalWeeks }, (_, index) => index + 1),
    )
    expect(view.blockWeeks.filter((week) => week.isDeload).map((week) => week.week)).toEqual([
      meso.deloadWeek,
    ])
  })

  it('splits the block into past, current and future around the live week', async () => {
    // Week 1 of the block: nothing is past, week 1 is current.
    const first = await getDashboardView('2026-08-19')
    expect(first.blockWeeks[0]?.state).toBe('current')
    expect(first.blockWeeks.filter((week) => week.state === 'past')).toEqual([])
    expect(first.blockWeeks[1]?.state).toBe('future')

    // Three weeks in: two behind, one live, the rest ahead.
    const third = await getDashboardView('2026-08-31')
    expect(third.blockWeeks.map((week) => week.state)).toEqual([
      'past',
      'past',
      'current',
      'future',
      'future',
      'future',
    ])
  })

  it('shows the whole block as past once it is finished', async () => {
    // Well past the final week: the block is over and waits for a new one.
    const view = await getDashboardView('2026-11-02')
    expect(view.activeBlock?.isComplete).toBe(true)
    expect(view.blockWeeks.every((week) => week.state === 'past')).toBe(true)
  })
})
