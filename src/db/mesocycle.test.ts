import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import {
  completeSession,
  generatePrescriptions,
  saveExerciseFeedback,
  saveSet,
  saveSorenessFeedback,
  startNewMesocycle,
  startSession,
} from './mutations'
import { getActiveSessionView, getPreviousExerciseSets, getTodayView } from './queries'
import { seedIfEmpty } from './seed'
import type { Rir, Session } from './schema'

/**
 * The Phase 5 gate (BRIEF Part 8): simulate six weeks and assert the deload
 * and the reset into week one of the next block.
 */

const CARDIO = { durationMin: 45, inclinePct: 10, speedMph: 3 }

beforeEach(async () => {
  await db.delete()
  await db.open()
  // Seeded on Sunday 16 Aug 2026 → block anchors to Monday the 17th.
  await seedIfEmpty(new Date(2026, 7, 16))
})

async function pressId(): Promise<string> {
  const template = await db.dayTemplates.where('letter').equals('A').first()
  const id = template?.exerciseIds[0]
  if (!id) throw new Error('no incline press')
  return id
}

async function rxFor(sessionId: string, exerciseId: string) {
  const rx = await db.prescriptions
    .where('sessionId')
    .equals(sessionId)
    .filter((p) => p.exerciseId === exerciseId)
    .first()
  if (!rx) throw new Error('no prescription')
  return rx
}

/** Trains a full Day A: soreness, prescriptions, sets as told, feedback, done. */
async function trainDayA(
  date: string,
  opts: { weightLb: number; reps: number; sets: number; rir: Rir },
): Promise<Session> {
  const session = await startSession(date)
  const template = await db.dayTemplates.get(session.dayTemplateId)
  if (!template) throw new Error('no template')

  if (!session.isDeload) {
    for (const groupId of template.sorenessPromptGroupIds) {
      await saveSorenessFeedback(session.id, groupId, 'a_little')
    }
  }
  await generatePrescriptions(session.id)

  const exerciseId = await pressId()
  for (let i = 0; i < opts.sets; i += 1) {
    await saveSet({
      sessionId: session.id,
      exerciseId,
      setIndex: i,
      weightLb: opts.weightLb,
      reps: opts.reps,
    })
  }
  if (!session.isDeload) {
    await saveExerciseFeedback(session.id, exerciseId, {
      pump: 'moderate',
      rir: opts.rir,
      jointPain: null,
    })
  }
  await completeSession(session.id, CARDIO)
  return session
}

describe('the six-week cycle, simulated end to end', () => {
  it('runs five accumulation weeks, deloads week six, and resets into a new block', async () => {
    const exerciseId = await pressId()

    // Weeks 1–5: one Day A per week, RIR 0 throughout so the weight holds at
    // 185 and the numbers stay predictable.
    const mondays = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']
    for (const monday of mondays) {
      const session = await trainDayA(monday, { weightLb: 185, reps: 10, sets: 3, rir: '0' })
      expect(session.isDeload).toBe(false)
    }

    // Week 6, Monday 21 September: the deload arrives on its own.
    const deloadDay = await startSession('2026-09-21')
    expect(deloadDay.weekNumber).toBe(6)
    expect(deloadDay.isDeload).toBe(true)

    // No check-in questions on a deload.
    const view = await getActiveSessionView()
    expect(view?.sorenessPrompts).toEqual([])

    await generatePrescriptions(deloadDay.id)
    const deloadRx = await rxFor(deloadDay.id, exerciseId)
    expect(deloadRx.plannedSets).toBe(2) // floor(3/2) clamped up to 2
    expect(deloadRx.plannedWeightLb).toBe(165) // 185 − 10% = 166.5 → nearest 5
    expect(deloadRx.targetRir).toBe(4)
    expect(deloadRx.loadAction).toBe('hold')

    for (let i = 0; i < 2; i += 1) {
      await saveSet({ sessionId: deloadDay.id, exerciseId, setIndex: i, weightLb: 165, reps: 10 })
    }
    await completeSession(deloadDay.id, CARDIO)

    // The Monday after week six: the block is over and nothing rolls over by
    // itself (decision A-4).
    const after = await getTodayView('2026-09-28')
    expect(after.position?.isComplete).toBe(true)

    // The deliberate tap: a new block, anchored to that Monday.
    await startNewMesocycle(new Date(2026, 8, 28))
    const fresh = await getTodayView('2026-09-28')
    expect(fresh.position?.isComplete).toBe(false)
    expect(fresh.position?.weekNumber).toBe(1)

    const oldMeso = await db.mesocycles.where('status').equals('completed').first()
    expect(oldMeso?.startDate).toBe('2026-08-17')

    // Week one of the new block: prescriptions come from the PRE-deload
    // session — 3 working sets at 185 — never from the 2 × 165 deload.
    const week1 = await startSession('2026-09-28')
    expect(week1.weekNumber).toBe(1)
    expect(week1.isDeload).toBe(false)

    const template = await db.dayTemplates.get(week1.dayTemplateId)
    for (const groupId of template?.sorenessPromptGroupIds ?? []) {
      await saveSorenessFeedback(week1.id, groupId, 'a_little')
    }
    await generatePrescriptions(week1.id)

    const rx = await rxFor(week1.id, exerciseId)
    expect(rx.plannedWeightLb).toBe(185) // last working weight, not 165
    expect(rx.plannedSets).toBe(3) // pre-deload set count (RIR 0 held it flat)
    expect(rx.mesocycleId).not.toBe(deloadRx.mesocycleId)

    // And the greyed target to beat is the working session, not the deload.
    const previous = await getPreviousExerciseSets(exerciseId, week1.id)
    expect(previous.map((s) => s.weightLb)).toEqual([185, 185, 185])
  })

  it('the second deload day of week six also halves from week five, not from the first deload day', async () => {
    const exerciseId = await pressId()
    await trainDayA('2026-09-14', { weightLb: 185, reps: 10, sets: 4, rir: '0' }) // week 5

    // Week 6 Monday: deload, 2 sets at 165.
    const monday = await startSession('2026-09-21')
    expect(monday.isDeload).toBe(true)
    await generatePrescriptions(monday.id)
    for (let i = 0; i < 2; i += 1) {
      await saveSet({ sessionId: monday.id, exerciseId, setIndex: i, weightLb: 165, reps: 10 })
    }
    await completeSession(monday.id, CARDIO)

    // Week 6 Thursday: still halves week five's 4 sets, still −10% off 185.
    const thursday = await startSession('2026-09-24')
    expect(thursday.isDeload).toBe(true)
    await generatePrescriptions(thursday.id)
    const rx = await rxFor(thursday.id, exerciseId)
    expect(rx.plannedSets).toBe(2) // floor(4/2), not floor(2/2)→clamp
    expect(rx.plannedWeightLb).toBe(165) // from 185, not 165 − 10%
  })

  it('the never-increase-twice guard resets across the block boundary', async () => {
    const exerciseId = await pressId()

    // Last accumulation session of the old block: an increase happened and
    // the lifter still had plenty left.
    const week5 = await startSession('2026-09-14')
    const template = await db.dayTemplates.get(week5.dayTemplateId)
    for (const groupId of template?.sorenessPromptGroupIds ?? []) {
      await saveSorenessFeedback(week5.id, groupId, 'a_little')
    }
    await generatePrescriptions(week5.id)
    // Force the stored action to 'increase' to represent that history.
    const week5rx = await rxFor(week5.id, exerciseId)
    await db.prescriptions.update(week5rx.id, { loadAction: 'increase' })
    for (let i = 0; i < 3; i += 1) {
      await saveSet({ sessionId: week5.id, exerciseId, setIndex: i, weightLb: 190, reps: 10 })
    }
    await saveExerciseFeedback(week5.id, exerciseId, { pump: 'moderate', rir: '2', jointPain: null })
    await completeSession(week5.id, CARDIO)

    // New block, week one: within a block this would be held ("earn it
    // twice"); across the boundary the guard resets and RIR 2 earns +5.
    await startNewMesocycle(new Date(2026, 8, 28))
    const week1 = await startSession('2026-09-28')
    for (const groupId of template?.sorenessPromptGroupIds ?? []) {
      await saveSorenessFeedback(week1.id, groupId, 'a_little')
    }
    await generatePrescriptions(week1.id)

    const rx = await rxFor(week1.id, exerciseId)
    expect(rx.loadAction).toBe('increase')
    expect(rx.plannedWeightLb).toBe(195)
  })
})
