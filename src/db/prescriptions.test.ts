import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import {
  addPlannedSet,
  capPlannedSetsAtLogged,
  completeSession,
  generatePrescriptions,
  saveExerciseFeedback,
  saveSet,
  saveSorenessFeedback,
  startSession,
} from './mutations'
import { getActiveSessionView } from './queries'
import { seedIfEmpty } from './seed'
import type { Session, Soreness } from './schema'

const SEEDED_ON = new Date(2026, 7, 19)
const MONDAY = '2026-08-17'
const THURSDAY = '2026-08-20'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedIfEmpty(SEEDED_ON)
})

async function templateFor(session: Session) {
  const template = await db.dayTemplates.get(session.dayTemplateId)
  if (!template) throw new Error('missing template')
  return template
}

/** Answers every soreness prompt for the session with one value. */
async function answerSoreness(session: Session, soreness: Soreness) {
  const template = await templateFor(session)
  for (const groupId of template.sorenessPromptGroupIds) {
    await saveSorenessFeedback(session.id, groupId, soreness)
  }
}

async function prescriptionFor(sessionId: string, exerciseId: string) {
  const row = await db.prescriptions
    .where('sessionId')
    .equals(sessionId)
    .filter((p) => p.exerciseId === exerciseId)
    .first()
  if (!row) throw new Error('no prescription')
  return row
}

describe('generatePrescriptions', () => {
  it('prescribes 3 sets and no weight for every exercise the first time', async () => {
    const session = await startSession(MONDAY)
    await answerSoreness(session, 'none')
    await generatePrescriptions(session.id)

    const template = await templateFor(session)
    const rows = await db.prescriptions.where('sessionId').equals(session.id).toArray()
    expect(rows).toHaveLength(template.exerciseIds.length)
    for (const row of rows) {
      expect(row.plannedSets).toBe(3)
      expect(row.plannedWeightLb).toBeNull()
      expect(row.sentence.length).toBeGreaterThan(0)
    }
  })

  it('is idempotent — a reload cannot change the day’s plan', async () => {
    const session = await startSession(MONDAY)
    await answerSoreness(session, 'none')
    await generatePrescriptions(session.id)
    const before = await db.prescriptions.where('sessionId').equals(session.id).toArray()

    // Different soreness now on record; regeneration must not happen.
    await answerSoreness(session, 'still_sore')
    await generatePrescriptions(session.id)
    const after = await db.prescriptions.where('sessionId').equals(session.id).toArray()

    expect(after).toEqual(before)
  })

  it('carries session 1’s feedback into session 2’s numbers — the full loop', async () => {
    // Monday: first time, log 3 sets of incline press at 185, report a great
    // pump with 2 reps in the tank.
    const monday = await startSession(MONDAY)
    await answerSoreness(monday, 'none')
    await generatePrescriptions(monday.id)

    const template = await templateFor(monday)
    const [pressId] = template.exerciseIds
    if (!pressId) throw new Error('no exercise')

    for (let i = 0; i < 3; i += 1) {
      await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: i, weightLb: 185, reps: 10 })
    }
    await saveExerciseFeedback(monday.id, pressId, { pump: 'great', rir: '2', jointPain: null })
    await completeSession(monday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })

    // Thursday: not sore. RIR 2 earns +5 lb; soreness none × pump great adds a set.
    const thursday = await startSession(THURSDAY)
    await answerSoreness(thursday, 'none')
    await generatePrescriptions(thursday.id)

    const rx = await prescriptionFor(thursday.id, pressId)
    expect(rx.plannedWeightLb).toBe(190)
    expect(rx.loadAction).toBe('increase')
    expect(rx.plannedSets).toBe(4) // 3 performed + 1 from none×great
    expect(rx.sentence).toMatch(/5 lb/)
  })

  it('never increases twice in a row across real sessions', async () => {
    // Monday earns an increase…
    const monday = await startSession(MONDAY)
    await answerSoreness(monday, 'a_little')
    await generatePrescriptions(monday.id)
    const template = await templateFor(monday)
    const [pressId] = template.exerciseIds
    if (!pressId) throw new Error('no exercise')
    for (let i = 0; i < 3; i += 1) {
      await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: i, weightLb: 185, reps: 10 })
    }
    await saveExerciseFeedback(monday.id, pressId, { pump: 'moderate', rir: '2', jointPain: null })
    await completeSession(monday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })

    // …Thursday’s prescription is an increase. The user hits it and again
    // reports plenty in the tank.
    const thursday = await startSession(THURSDAY)
    await answerSoreness(thursday, 'a_little')
    await generatePrescriptions(thursday.id)
    const thursdayRx = await prescriptionFor(thursday.id, pressId)
    expect(thursdayRx.loadAction).toBe('increase')
    expect(thursdayRx.plannedWeightLb).toBe(190)

    for (let i = 0; i < 3; i += 1) {
      await saveSet({ sessionId: thursday.id, exerciseId: pressId, setIndex: i, weightLb: 190, reps: 10 })
    }
    await saveExerciseFeedback(thursday.id, pressId, { pump: 'moderate', rir: '3+', jointPain: null })
    await completeSession(thursday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })

    // The following Monday must hold and chase reps despite RIR 3+.
    const nextMonday = await startSession('2026-08-24')
    await answerSoreness(nextMonday, 'a_little')
    await generatePrescriptions(nextMonday.id)
    const rx = await prescriptionFor(nextMonday.id, pressId)
    expect(rx.loadAction).toBe('hold')
    expect(rx.plannedWeightLb).toBe(190)
    expect(rx.minRepsToBeat).toBe(10)
  })

  it('lets calves inherit the quads soreness answer (PLAN §2.3)', async () => {
    // Build history for the calf raise on Tuesday, then be still-sore in the
    // quads on Friday: the calf raise — never prompted for directly — must
    // drop a set through inheritance.
    const tuesday = await startSession('2026-08-18')
    await answerSoreness(tuesday, 'none')
    await generatePrescriptions(tuesday.id)
    const template = await templateFor(tuesday)
    const calfId = template.exerciseIds[3]
    if (!calfId) throw new Error('expected the calf raise')

    for (let i = 0; i < 3; i += 1) {
      await saveSet({ sessionId: tuesday.id, exerciseId: calfId, setIndex: i, weightLb: 200, reps: 15 })
    }
    await saveExerciseFeedback(tuesday.id, calfId, { pump: 'great', rir: '0', jointPain: null })
    await completeSession(tuesday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })

    const friday = await startSession('2026-08-21')
    await answerSoreness(friday, 'still_sore')
    await generatePrescriptions(friday.id)

    const rx = await prescriptionFor(friday.id, calfId)
    expect(rx.plannedSets).toBe(2) // 3 − 1, inherited still-sore
    expect(rx.loadAction).toBe('hold')
  })

  it('prescribes a deload with no feedback consulted on a deload session', async () => {
    // History first.
    const monday = await startSession(MONDAY)
    await answerSoreness(monday, 'none')
    await generatePrescriptions(monday.id)
    const template = await templateFor(monday)
    const [pressId] = template.exerciseIds
    if (!pressId) throw new Error('no exercise')
    for (let i = 0; i < 4; i += 1) {
      await saveSet({ sessionId: monday.id, exerciseId: pressId, setIndex: i, weightLb: 150, reps: 10 })
    }
    await saveExerciseFeedback(monday.id, pressId, { pump: 'low', rir: '3+', jointPain: null })
    await completeSession(monday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })

    // Force Thursday into a deload (week six behaviour arrives in Phase 5;
    // the flag exists now).
    const thursday = await startSession(THURSDAY)
    await db.sessions.update(thursday.id, { isDeload: true })
    await generatePrescriptions(thursday.id)

    const rx = await prescriptionFor(thursday.id, pressId)
    expect(rx.plannedSets).toBe(2) // floor(4/2)
    expect(rx.plannedWeightLb).toBe(135) // 150 − 10%
    expect(rx.targetRir).toBe(4)
    expect(rx.loadAction).toBe('hold') // RIR 3+ ignored on a deload
  })

  it('adds and caps planned sets mid-session, without touching progression inputs', async () => {
    const session = await startSession(MONDAY)
    await answerSoreness(session, 'none')
    await generatePrescriptions(session.id)
    const template = await templateFor(session)
    const [pressId] = template.exerciseIds
    if (!pressId) throw new Error('no exercise')

    // Add: 3 → 4.
    await addPlannedSet(session.id, pressId)
    expect((await prescriptionFor(session.id, pressId)).plannedSets).toBe(4)

    // Two sets logged, then skip the rest: the plan shrinks to the work done.
    await saveSet({ sessionId: session.id, exerciseId: pressId, setIndex: 0, weightLb: 185, reps: 10 })
    await saveSet({ sessionId: session.id, exerciseId: pressId, setIndex: 1, weightLb: 185, reps: 9 })
    await capPlannedSetsAtLogged(session.id, pressId)
    expect((await prescriptionFor(session.id, pressId)).plannedSets).toBe(2)

    // Skipping with nothing logged caps at zero — a fully skipped exercise.
    const [, flatId] = template.exerciseIds
    if (!flatId) throw new Error('no second exercise')
    await capPlannedSetsAtLogged(session.id, flatId)
    expect((await prescriptionFor(session.id, flatId)).plannedSets).toBe(0)

    // The engine's next-session input is the performed sets, not the plan —
    // complete the session and confirm Thursday bases on 2 real sets.
    await saveExerciseFeedback(session.id, pressId, { pump: 'moderate', rir: '0', jointPain: null })
    await completeSession(session.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })
    const thursday = await startSession('2026-08-20')
    await answerSoreness(thursday, 'a_little')
    await generatePrescriptions(thursday.id)
    expect((await prescriptionFor(thursday.id, pressId)).plannedSets).toBe(2)
  })

  it('exposes prompts and prescriptions through the session view', async () => {
    const session = await startSession(MONDAY)
    let view = await getActiveSessionView()
    expect(view?.sorenessPrompts.map((p) => p.muscleGroupName)).toEqual([
      'Chest',
      'Triceps',
    ])
    expect(view?.sorenessPrompts.every((p) => !p.answered)).toBe(true)

    await answerSoreness(session, 'none')
    await generatePrescriptions(session.id)

    view = await getActiveSessionView()
    expect(view?.sorenessPrompts.every((p) => p.answered)).toBe(true)
    const template = await templateFor(session)
    for (const exerciseId of template.exerciseIds) {
      expect(view?.prescriptionsByExercise[exerciseId]?.sentence.length).toBeGreaterThan(0)
    }
  })
})
