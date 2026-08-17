import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import {
  completeSession,
  saveSet,
  skipToday,
  startSession,
} from './mutations'
import { getHistoryView } from './queries'
import { seedIfEmpty } from './seed'

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

describe('getHistoryView', () => {
  it('is empty before any session has been completed', async () => {
    const view = await getHistoryView(null)
    expect(view.exercises).toEqual([])
    expect(view.points).toEqual([])
  })

  it('computes top weight, volume and set count per completed session, oldest first', async () => {
    const [pressId] = await dayAIds()
    if (!pressId) throw new Error('no press')

    const monday = await startSession('2026-08-17')
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 1, weightLb: 190, reps: 6 })
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 2, weightLb: 185, reps: 8 })
    await completeSession(monday.id, CARDIO)

    const thursday = await startSession('2026-08-20')
    await saveSet({ sessionId: thursday.id, exerciseId: pressId, setIndex: 0, weightLb: 190, reps: 9 })
    await saveSet({ sessionId: thursday.id, exerciseId: pressId, setIndex: 1, weightLb: 190, reps: 8 })
    await completeSession(thursday.id, CARDIO)

    const view = await getHistoryView(pressId)
    expect(view.points).toHaveLength(2)

    const [first, second] = view.points
    expect(first?.date).toBe('2026-08-17')
    expect(first?.topWeightLb).toBe(190)
    expect(first?.volumeLb).toBe(185 * 10 + 190 * 6 + 185 * 8)
    expect(first?.setCount).toBe(3)
    expect(second?.date).toBe('2026-08-20')
    expect(second?.volumeLb).toBe(190 * 9 + 190 * 8)
    expect(second?.setCount).toBe(2)
  })

  it('never counts in-progress or skipped sessions', async () => {
    const [pressId] = await dayAIds()
    if (!pressId) throw new Error('no press')

    // In progress with a set logged: not history yet.
    const monday = await startSession('2026-08-17')
    await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
    // And Tuesday skipped.
    await skipToday('2026-08-18')

    const view = await getHistoryView(pressId)
    expect(view.points).toEqual([])
    expect(view.exercises).toEqual([])
  })

  it('lists only exercises with data, in program order, and flags deloads', async () => {
    const [pressId, flatId] = await dayAIds()
    if (!pressId || !flatId) throw new Error('need two exercises')

    // Train them out of order — flat press first — and one deload day.
    const monday = await startSession('2026-08-17')
    await saveSet({ sessionId: monday.id, exerciseId: flatId, setIndex: 0, weightLb: 150, reps: 10 })
    await completeSession(monday.id, CARDIO)

    const thursday = await startSession('2026-08-20')
    await db.sessions.update(thursday.id, { isDeload: true })
    await saveSet({ sessionId: thursday.id, exerciseId: pressId, setIndex: 0, weightLb: 165, reps: 10 })
    await completeSession(thursday.id, CARDIO)

    const view = await getHistoryView(pressId)
    // Program order: incline press is exercise 1, flat press exercise 2 —
    // regardless of which was trained first.
    expect(view.exercises.map((e) => e.id)).toEqual([pressId, flatId])
    expect(view.points[0]?.isDeload).toBe(true)
  })
})
