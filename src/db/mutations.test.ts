import { beforeEach, describe, expect, it } from 'vitest'

import { WorkoutDatabase, db } from './db'
import {
  completeSession,
  saveSet,
  setSessionPosition,
  skipToday,
  startSession,
  undoSkip,
} from './mutations'
import {
  getActiveSessionView,
  getPreviousExerciseSets,
  getSessionView,
  getTodayView,
} from './queries'
import { seedIfEmpty } from './seed'

const SEEDED_ON = new Date(2026, 7, 19) // Wednesday 19 August 2026
const MONDAY = '2026-08-17'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedIfEmpty(SEEDED_ON)
})

async function dayAExerciseIds(): Promise<string[]> {
  const template = await db.dayTemplates.where('letter').equals('A').first()
  if (!template) throw new Error('Day A missing')
  return template.exerciseIds
}

describe('startSession', () => {
  it('creates an in-progress session for a training day with the right week', async () => {
    const session = await startSession(MONDAY)

    expect(session.status).toBe('in_progress')
    expect(session.date).toBe(MONDAY)
    expect(session.weekNumber).toBe(1)
    expect(session.isDeload).toBe(false)
    expect(session.currentExerciseIndex).toBe(0)

    const template = await db.dayTemplates.get(session.dayTemplateId)
    expect(template?.letter).toBe('A')
  })

  it('is idempotent — starting twice resumes the same session', async () => {
    const first = await startSession(MONDAY)
    const second = await startSession(MONDAY)
    expect(second.id).toBe(first.id)
    expect(await db.sessions.count()).toBe(1)
  })

  it('refuses a rest day', async () => {
    await expect(startSession('2026-08-23')).rejects.toThrow(/rest day/i)
  })

  it('turns a skipped day back into a live session when the user changes their mind', async () => {
    await skipToday(MONDAY)
    const session = await startSession(MONDAY)
    expect(session.status).toBe('in_progress')
    expect(await db.sessions.count()).toBe(1)
  })
})

describe('saveSet — the write that must never be lost', () => {
  it('is durably written the moment the promise resolves', async () => {
    const session = await startSession(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')

    await saveSet({ sessionId: session.id, exerciseId, setIndex: 0, weightLb: 185, reps: 10 })

    // The kill test: a completely fresh database connection — the storage-layer
    // equivalent of the tab being killed and reopened — must see the set.
    db.close()
    const reopened = new WorkoutDatabase()
    const sets = await reopened.sets.where('sessionId').equals(session.id).toArray()
    reopened.close()
    await db.open()

    expect(sets).toHaveLength(1)
    expect(sets[0]?.weightLb).toBe(185)
    expect(sets[0]?.reps).toBe(10)
  })

  it('logs successive sets as separate rows', async () => {
    const session = await startSession(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')

    await saveSet({ sessionId: session.id, exerciseId, setIndex: 0, weightLb: 185, reps: 10 })
    await saveSet({ sessionId: session.id, exerciseId, setIndex: 1, weightLb: 185, reps: 8 })

    const sets = await db.sets.where('sessionId').equals(session.id).sortBy('setIndex')
    expect(sets.map((s) => s.reps)).toEqual([10, 8])
  })

  it('refuses to log into a session that is not in progress', async () => {
    // A stale tab left on the session screen after the day was skipped (or
    // completed) must fail loudly rather than writing sets that nothing will
    // ever show again.
    const skipped = await skipToday(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')

    await expect(
      saveSet({ sessionId: skipped.id, exerciseId, setIndex: 0, weightLb: 185, reps: 10 }),
    ).rejects.toThrow(/not in progress/i)
    expect(await db.sets.count()).toBe(0)
  })

  it('accepts a decimal weight exactly as entered', async () => {
    // The tap-to-type fallback exists for weights the stepper grid can't
    // reach; 187.5 must be stored as 187.5, not snapped to an increment.
    const session = await startSession(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')

    await saveSet({ sessionId: session.id, exerciseId, setIndex: 0, weightLb: 187.5, reps: 10 })
    const set = await db.sets.toCollection().first()
    expect(set?.weightLb).toBe(187.5)
  })

  it('overwrites, not duplicates, when the same set index is saved again', async () => {
    const session = await startSession(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')

    await saveSet({ sessionId: session.id, exerciseId, setIndex: 0, weightLb: 185, reps: 10 })
    await saveSet({ sessionId: session.id, exerciseId, setIndex: 0, weightLb: 190, reps: 9 })

    const sets = await db.sets.where('sessionId').equals(session.id).toArray()
    expect(sets).toHaveLength(1)
    expect(sets[0]?.weightLb).toBe(190)
    expect(sets[0]?.reps).toBe(9)
  })
})

describe('resume position', () => {
  it('survives a fresh database connection', async () => {
    const session = await startSession(MONDAY)
    await setSessionPosition(session.id, 3)

    db.close()
    const reopened = new WorkoutDatabase()
    const stored = await reopened.sessions.get(session.id)
    reopened.close()
    await db.open()

    expect(stored?.currentExerciseIndex).toBe(3)
    expect(stored?.status).toBe('in_progress')
  })
})

describe('completeSession', () => {
  it('marks the session complete with cardio and remembers cardio for next time', async () => {
    const session = await startSession(MONDAY)
    const cardio = { durationMin: 45, inclinePct: 12, speedMph: 3 }

    await completeSession(session.id, cardio)

    const stored = await db.sessions.get(session.id)
    expect(stored?.status).toBe('completed')
    expect(stored?.completedAt).not.toBeNull()
    expect(stored?.cardio).toEqual(cardio)

    // The cardio screen pre-fills with last session's settings (BRIEF Part 6).
    const settings = await db.settings.get('app')
    expect(settings?.lastCardio).toEqual(cardio)
  })
})

describe('skipToday / undoSkip', () => {
  it('records an explicit skip', async () => {
    const session = await skipToday(MONDAY)
    expect(session.status).toBe('skipped')
  })

  it('does not clobber a session already in progress', async () => {
    const live = await startSession(MONDAY)
    const after = await skipToday(MONDAY)
    expect(after.id).toBe(live.id)
    expect(after.status).toBe('in_progress')
  })

  it('undo removes the skip so the day reads as simply untrained', async () => {
    await skipToday(MONDAY)
    await undoSkip(MONDAY)
    expect(await db.sessions.count()).toBe(0)
  })

  it('undo never touches a session with logged work', async () => {
    const session = await startSession(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')
    await saveSet({ sessionId: session.id, exerciseId, setIndex: 0, weightLb: 100, reps: 10 })

    await undoSkip(MONDAY)
    expect(await db.sessions.count()).toBe(1)
    expect(await db.sets.count()).toBe(1)
  })

  it('undo refuses to orphan sets even on a genuinely skipped session', async () => {
    // Belt and braces: if sets have ended up under a skipped session by any
    // path at all, deleting the session would strand them invisibly. The
    // guard checks for sets directly, not the status story.
    const skipped = await skipToday(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')
    await db.sets.add({
      id: 'orphan-candidate',
      sessionId: skipped.id,
      exerciseId,
      setIndex: 0,
      weightLb: 185,
      reps: 10,
      prescribedWeightLb: null,
      prescribedReps: null,
      loggedAt: 1,
      updatedAt: 1,
    })

    await undoSkip(MONDAY)
    expect(await db.sessions.count()).toBe(1)
    expect(await db.sets.count()).toBe(1)
  })
})

describe('a session that crosses midnight', () => {
  it('stays reachable as the active session on the new day', async () => {
    const monday = await startSession(MONDAY)
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')
    await saveSet({ sessionId: monday.id, exerciseId, setIndex: 0, weightLb: 185, reps: 10 })
    await setSessionPosition(monday.id, 2)

    // It is now Tuesday and the workout was never finished. The session
    // screen follows the active session, not the calendar.
    const active = await getActiveSessionView()
    expect(active?.session.id).toBe(monday.id)
    expect(active?.session.currentExerciseIndex).toBe(2)

    // And the home screen offers it for finishing.
    const today = await getTodayView('2026-08-18')
    expect(today.unfinishedSession?.id).toBe(monday.id)
  })

  it('can be completed on the new day, keeping its own date', async () => {
    const monday = await startSession(MONDAY)
    await completeSession(monday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })

    expect(await getActiveSessionView()).toBeNull()
    const stored = await db.sessions.get(monday.id)
    expect(stored?.status).toBe('completed')
    expect(stored?.date).toBe(MONDAY)
    expect((await getTodayView('2026-08-18')).unfinishedSession).toBeUndefined()
  })

  it('yields to a newly started session rather than hijacking today', async () => {
    const monday = await startSession(MONDAY)
    const tuesday = await startSession('2026-08-18')

    // Once today's session exists, it is the active one; the stale Monday
    // session no longer intercepts the session screen.
    expect((await getActiveSessionView())?.session.id).toBe(tuesday.id)
    expect(monday.id).not.toBe(tuesday.id)
  })
})

describe('getPreviousExerciseSets — the greyed target to beat', () => {
  it('returns the most recent completed session’s sets for the exercise', async () => {
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')

    const monday = await startSession(MONDAY)
    await saveSet({ sessionId: monday.id, exerciseId, setIndex: 0, weightLb: 180, reps: 9 })
    await saveSet({ sessionId: monday.id, exerciseId, setIndex: 1, weightLb: 180, reps: 8 })
    await completeSession(monday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })

    const thursday = await startSession('2026-08-20')
    const prev = await getPreviousExerciseSets(exerciseId, thursday.id)

    expect(prev.map((s) => `${s.weightLb}x${s.reps}`)).toEqual(['180x9', '180x8'])
  })

  it('ignores in-progress and skipped sessions', async () => {
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')

    // An abandoned in-progress Monday with a set logged must not become
    // Thursday's target.
    const monday = await startSession(MONDAY)
    await saveSet({ sessionId: monday.id, exerciseId, setIndex: 0, weightLb: 300, reps: 1 })

    const thursday = await startSession('2026-08-20')
    expect(await getPreviousExerciseSets(exerciseId, thursday.id)).toEqual([])
  })

  it('returns empty for a brand-new exercise', async () => {
    const [exerciseId] = await dayAExerciseIds()
    if (!exerciseId) throw new Error('no exercise')
    const session = await startSession(MONDAY)
    expect(await getPreviousExerciseSets(exerciseId, session.id)).toEqual([])
  })
})

describe('getSessionView', () => {
  it('assembles the session, its sets and previous targets in one read', async () => {
    const [ex0, ex1] = await dayAExerciseIds()
    if (!ex0 || !ex1) throw new Error('need two exercises')

    const session = await startSession(MONDAY)
    await saveSet({ sessionId: session.id, exerciseId: ex0, setIndex: 0, weightLb: 185, reps: 10 })
    await saveSet({ sessionId: session.id, exerciseId: ex1, setIndex: 0, weightLb: 120, reps: 12 })

    const view = await getSessionView(MONDAY)
    expect(view).not.toBeNull()
    expect(view?.session.id).toBe(session.id)
    expect(view?.exercises).toHaveLength(5)
    expect(view?.setsByExercise[ex0]).toHaveLength(1)
    expect(view?.setsByExercise[ex1]).toHaveLength(1)
    expect(view?.setsByExercise[ex0]?.[0]?.weightLb).toBe(185)
  })

  it('is null when nothing has been started today', async () => {
    expect(await getSessionView(MONDAY)).toBeNull()
  })
})
