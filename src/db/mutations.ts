/**
 * Every write the UI performs. Components import from here and from
 * queries.ts, never from db.ts — the same boundary that keeps a future sync
 * layer out of the components (CLAUDE.md).
 *
 * The contract that matters most lives in saveSet: a set is committed to
 * IndexedDB before the returned promise resolves, and the UI only renders a
 * set as logged from a live query — so nothing the user believes is saved is
 * ever sitting in React state (BRIEF Part 2, PLAN §2.1).
 */

import { db } from './db'
import type {
  CardioEntry,
  IsoDate,
  Prescription,
  Pump,
  Rir,
  Session,
  Soreness,
} from './schema'
import { newId } from '../lib/ids'
import { toIsoDate, upcomingTrainingWeekStart } from '../lib/date'
import { mesocyclePosition, templateForDate } from '../lib/schedule'
import { MESOCYCLE_DELOAD_WEEK, MESOCYCLE_TOTAL_WEEKS } from './seed'
import { recommend } from '../engine/recommend'
import type { ExerciseHistoryInput } from '../engine/types'

/** Builds the row for a new session on `date`, throwing on a rest day. */
async function buildSession(
  date: IsoDate,
  status: Session['status'],
  timestamp: number,
): Promise<Session> {
  const templates = await db.dayTemplates.toArray()
  const template = templateForDate(templates, date)
  if (!template) {
    throw new Error(`Cannot start a session on ${date}: it is a rest day`)
  }

  const settings = await db.settings.get('app')
  const mesocycle = settings
    ? await db.mesocycles.get(settings.activeMesocycleId)
    : undefined
  if (!mesocycle) {
    throw new Error('No active mesocycle — the database has not been seeded')
  }

  const position = mesocyclePosition(mesocycle, date)

  return {
    id: newId(),
    date,
    dayTemplateId: template.id,
    mesocycleId: mesocycle.id,
    weekNumber: position.weekNumber,
    isDeload: position.isDeloadWeek,
    status,
    currentExerciseIndex: 0,
    cardio: null,
    startedAt: timestamp,
    completedAt: null,
    updatedAt: timestamp,
  }
}

/**
 * Starts today's session, or resumes the existing one — calling this twice
 * never creates two sessions. A previously skipped day is revived into a live
 * session, since tapping Start is the clearest possible "I changed my mind".
 */
export async function startSession(
  date: IsoDate,
  now: Date = new Date(),
): Promise<Session> {
  const timestamp = now.getTime()

  return db.transaction(
    'rw',
    [db.sessions, db.dayTemplates, db.mesocycles, db.settings],
    async () => {
      const existing = await db.sessions.where('date').equals(date).first()

      if (existing) {
        if (existing.status !== 'skipped') return existing
        const revived: Session = {
          ...existing,
          status: 'in_progress',
          startedAt: timestamp,
          updatedAt: timestamp,
        }
        await db.sessions.put(revived)
        return revived
      }

      const session = await buildSession(date, 'in_progress', timestamp)
      await db.sessions.add(session)
      return session
    },
  )
}

export interface SaveSetInput {
  sessionId: string
  exerciseId: string
  /** 0-based position within this exercise, this session. */
  setIndex: number
  weightLb: number
  reps: number
  /** What the engine asked for, kept so History can compare plan to reality. */
  prescribedWeightLb?: number | null
  prescribedReps?: number | null
}

/**
 * Writes one set. Resolves only after the transaction has committed — the
 * caller renders the set as logged from a live query, never optimistically.
 * Saving an index that already exists overwrites it, which is how a mistyped
 * set gets corrected without duplicating.
 */
export async function saveSet(input: SaveSetInput, now: Date = new Date()): Promise<void> {
  const timestamp = now.getTime()

  await db.transaction('rw', [db.sets, db.sessions], async () => {
    // Sets only ever belong to a live session. A skipped or completed session
    // accepting writes is how logged work ends up invisible — a stale tab on
    // the session screen must fail loudly here, not lose data quietly.
    const session = await db.sessions.get(input.sessionId)
    if (!session || session.status !== 'in_progress') {
      throw new Error('Cannot log a set: this session is not in progress')
    }

    const existing = await db.sets
      .where('[sessionId+exerciseId]')
      .equals([input.sessionId, input.exerciseId])
      .filter((set) => set.setIndex === input.setIndex)
      .first()

    if (existing) {
      await db.sets.update(existing.id, {
        weightLb: input.weightLb,
        reps: input.reps,
        updatedAt: timestamp,
      })
    } else {
      await db.sets.add({
        id: newId(),
        sessionId: input.sessionId,
        exerciseId: input.exerciseId,
        setIndex: input.setIndex,
        weightLb: input.weightLb,
        reps: input.reps,
        prescribedWeightLb: input.prescribedWeightLb ?? null,
        prescribedReps: input.prescribedReps ?? null,
        loggedAt: timestamp,
        updatedAt: timestamp,
      })
    }

    await db.sessions.update(input.sessionId, { updatedAt: timestamp })
  })
}

/**
 * Records which exercise the user is on (the cardio step counts as one past
 * the last exercise), so a killed app reopens exactly where they stood.
 */
export async function setSessionPosition(
  sessionId: string,
  currentExerciseIndex: number,
  now: Date = new Date(),
): Promise<void> {
  await db.sessions.update(sessionId, {
    currentExerciseIndex,
    updatedAt: now.getTime(),
  })
}

/** Finishes the session and remembers the cardio settings for next time. */
export async function completeSession(
  sessionId: string,
  cardio: CardioEntry,
  now: Date = new Date(),
): Promise<void> {
  const timestamp = now.getTime()

  await db.transaction('rw', [db.sessions, db.settings], async () => {
    await db.sessions.update(sessionId, {
      status: 'completed',
      cardio,
      completedAt: timestamp,
      updatedAt: timestamp,
    })
    await db.settings.update('app', { lastCardio: cardio, updatedAt: timestamp })
  })
}

/**
 * Starts the next six-week block (decision A-4: always by hand, never
 * automatic). The old block is marked completed and the new one anchors to
 * the current training week — tapping it on a Sunday starts the block at the
 * Monday about to begin.
 */
export async function startNewMesocycle(now: Date = new Date()): Promise<void> {
  const timestamp = now.getTime()

  await db.transaction('rw', [db.mesocycles, db.settings, db.sessions], async () => {
    const settings = await db.settings.get('app')
    if (!settings) throw new Error('Database has not been seeded')

    // Guard at the data layer, not just the button: a block containing no
    // sessions has nothing to close, so a double-fire (or any future caller)
    // is a no-op instead of minting an empty junk mesocycle.
    const trained = await db.sessions
      .where('mesocycleId')
      .equals(settings.activeMesocycleId)
      .count()
    if (trained === 0) return

    await db.mesocycles.update(settings.activeMesocycleId, {
      status: 'completed',
      updatedAt: timestamp,
    })

    const id = newId()
    await db.mesocycles.add({
      id,
      startDate: upcomingTrainingWeekStart(toIsoDate(now)),
      totalWeeks: MESOCYCLE_TOTAL_WEEKS,
      deloadWeek: MESOCYCLE_DELOAD_WEEK,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.settings.update('app', { activeMesocycleId: id, updatedAt: timestamp })
  })
}

// ---------------------------------------------------------------------------
// Settings: library, day templates, appearance, app lock
// ---------------------------------------------------------------------------

export interface NewExerciseInput {
  name: string
  type: 'compound' | 'isolation'
  muscleGroupId: string
  repTargetMin: number
  repTargetMax: number
}

/** Adds a movement to the library (attached to no day until placed on one). */
export async function addExerciseToLibrary(
  input: NewExerciseInput,
  now: Date = new Date(),
): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('An exercise needs a name')
  if (input.repTargetMin < 1 || input.repTargetMax < input.repTargetMin) {
    throw new Error('Rep target range is invalid')
  }
  const timestamp = now.getTime()
  const id = newId()

  await db.transaction('rw', [db.exercises, db.muscleGroups], async () => {
    if (!(await db.muscleGroups.get(input.muscleGroupId))) {
      throw new Error('Unknown muscle group')
    }
    await db.exercises.add({
      id,
      name,
      type: input.type,
      muscleGroupId: input.muscleGroupId,
      repTargetMin: input.repTargetMin,
      repTargetMax: input.repTargetMax,
      weightIncrementLb: 5,
      restSeconds: input.type === 'compound' ? 150 : 120,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })
  return id
}

/** Appends a library exercise to a day. Already present → no-op. */
export async function addExerciseToDay(
  dayTemplateId: string,
  exerciseId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', [db.dayTemplates], async () => {
    const template = await db.dayTemplates.get(dayTemplateId)
    if (!template || template.exerciseIds.includes(exerciseId)) return
    await db.dayTemplates.update(dayTemplateId, {
      exerciseIds: [...template.exerciseIds, exerciseId],
      updatedAt: now.getTime(),
    })
  })
}

/** Removes an exercise from a day. History is untouched — only the plan. */
export async function removeExerciseFromDay(
  dayTemplateId: string,
  exerciseId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', [db.dayTemplates], async () => {
    const template = await db.dayTemplates.get(dayTemplateId)
    if (!template) return
    await db.dayTemplates.update(dayTemplateId, {
      exerciseIds: template.exerciseIds.filter((id) => id !== exerciseId),
      updatedAt: now.getTime(),
    })
  })
}

/** Moves an exercise one place up or down within its day. */
export async function moveExerciseInDay(
  dayTemplateId: string,
  exerciseId: string,
  direction: 'up' | 'down',
  now: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', [db.dayTemplates], async () => {
    const template = await db.dayTemplates.get(dayTemplateId)
    if (!template) return
    const ids = [...template.exerciseIds]
    const from = ids.indexOf(exerciseId)
    const to = direction === 'up' ? from - 1 : from + 1
    if (from < 0 || to < 0 || to >= ids.length) return
    const [moved] = ids.splice(from, 1)
    if (moved === undefined) return
    ids.splice(to, 0, moved)
    await db.dayTemplates.update(dayTemplateId, {
      exerciseIds: ids,
      updatedAt: now.getTime(),
    })
  })
}

export async function setTheme(theme: 'dark' | 'light', now: Date = new Date()): Promise<void> {
  await db.settings.update('app', { theme, updatedAt: now.getTime() })
}

/** Installs or replaces the app lock. Replacing requires the current PIN. */
export async function setAppLock(
  lock: import('./schema').AppLock,
  now: Date = new Date(),
): Promise<void> {
  await db.settings.update('app', { appLock: lock, updatedAt: now.getTime() })
}

export async function clearAppLock(now: Date = new Date()): Promise<void> {
  await db.settings.update('app', { appLock: null, updatedAt: now.getTime() })
}

/**
 * Adds one planned set to today's prescription for an exercise — the explicit
 * "I want a bonus set" action. The engine's 2–5 clamp governs what it
 * *prescribes*; a deliberate mid-session addition is the user's call.
 */
export async function addPlannedSet(
  sessionId: string,
  exerciseId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', [db.prescriptions], async () => {
    const rx = await db.prescriptions
      .where('sessionId')
      .equals(sessionId)
      .filter((row) => row.exerciseId === exerciseId)
      .first()
    if (!rx) return
    await db.prescriptions.update(rx.id, {
      plannedSets: rx.plannedSets + 1,
      updatedAt: now.getTime(),
    })
  })
}

/**
 * Ends the exercise at however many sets are already logged: the plan shrinks
 * to the work done (possibly zero — a fully skipped exercise). Progression is
 * untouched by this: the engine reads what was actually performed, so next
 * session bases on the real sets, exactly as decision A-1 intends.
 */
export async function capPlannedSetsAtLogged(
  sessionId: string,
  exerciseId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', [db.prescriptions, db.sets], async () => {
    const rx = await db.prescriptions
      .where('sessionId')
      .equals(sessionId)
      .filter((row) => row.exerciseId === exerciseId)
      .first()
    if (!rx) return
    const logged = await db.sets
      .where('[sessionId+exerciseId]')
      .equals([sessionId, exerciseId])
      .count()
    await db.prescriptions.update(rx.id, {
      plannedSets: logged,
      updatedAt: now.getTime(),
    })
  })
}

/** Records one soreness answer. Re-answering a group overwrites, not duplicates. */
export async function saveSorenessFeedback(
  sessionId: string,
  muscleGroupId: string,
  soreness: Soreness,
  now: Date = new Date(),
): Promise<void> {
  const timestamp = now.getTime()
  await db.transaction('rw', [db.sorenessFeedback], async () => {
    const existing = await db.sorenessFeedback
      .where('sessionId')
      .equals(sessionId)
      .filter((row) => row.muscleGroupId === muscleGroupId)
      .first()

    if (existing) {
      await db.sorenessFeedback.update(existing.id, { soreness, updatedAt: timestamp })
    } else {
      await db.sorenessFeedback.add({
        id: newId(),
        sessionId,
        muscleGroupId,
        soreness,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  })
}

export interface ExerciseFeedbackInput {
  pump: Pump
  rir: Rir
  /** Null when the dismissible joint-pain question was skipped. */
  jointPain: boolean | null
}

/** Records the pump/RIR/joint-pain answers for one exercise this session. */
export async function saveExerciseFeedback(
  sessionId: string,
  exerciseId: string,
  input: ExerciseFeedbackInput,
  now: Date = new Date(),
): Promise<void> {
  const timestamp = now.getTime()
  await db.transaction('rw', [db.exerciseFeedback], async () => {
    const existing = await db.exerciseFeedback
      .where('[sessionId+exerciseId]')
      .equals([sessionId, exerciseId])
      .first()

    if (existing) {
      await db.exerciseFeedback.update(existing.id, { ...input, updatedAt: timestamp })
    } else {
      await db.exerciseFeedback.add({
        id: newId(),
        sessionId,
        exerciseId,
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  })
}

/**
 * Runs the engine for every exercise in the session and stores the results —
 * the numbers *and* the sentence, so what the user was told is part of the
 * record (BRIEF Part 5).
 *
 * Called once the soreness prompts are answered, since the set matrix needs
 * today's soreness crossed with last session's pump. Idempotent: once a
 * session has prescriptions they are never regenerated, so a mid-session
 * reload cannot change the day's plan under the user's feet.
 */
export async function generatePrescriptions(
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  const timestamp = now.getTime()

  await db.transaction(
    'rw',
    [
      db.sessions,
      db.dayTemplates,
      db.exercises,
      db.muscleGroups,
      db.sets,
      db.exerciseFeedback,
      db.sorenessFeedback,
      db.prescriptions,
    ],
    async () => {
      if (await db.prescriptions.where('sessionId').equals(sessionId).first()) return

      const session = await db.sessions.get(sessionId)
      if (!session) throw new Error('Cannot prescribe for a session that does not exist')
      const template = await db.dayTemplates.get(session.dayTemplateId)
      if (!template) return

      // Today's soreness answers, resolved per muscle group with inheritance:
      // a group not prompted for borrows its parent's answer (PLAN §2.3).
      const sorenessByGroup = new Map<string, Soreness>()
      for (const row of await db.sorenessFeedback
        .where('sessionId')
        .equals(sessionId)
        .toArray()) {
        sorenessByGroup.set(row.muscleGroupId, row.soreness)
      }
      const groups = await db.muscleGroups.toArray()
      const inheritsFrom = new Map(groups.map((g) => [g.id, g.inheritsFromId]))

      function sorenessFor(muscleGroupId: string): Soreness | null {
        const direct = sorenessByGroup.get(muscleGroupId)
        if (direct) return direct
        const parent = inheritsFrom.get(muscleGroupId)
        return parent ? (sorenessByGroup.get(parent) ?? null) : null
      }

      const rows: Prescription[] = []

      for (const exerciseId of template.exerciseIds) {
        const exercise = await db.exercises.get(exerciseId)
        if (!exercise) continue

        // Last time this exercise was *worked* in a completed session, with
        // the feedback given that day and what the engine did to the load.
        // Deload sessions are invisible here (BRIEF Part 5): the week after a
        // deload starts from the deload week's pre-deload set counts at the
        // last working weight, and the second deload day of week six halves
        // from week five, not from the first deload day. (Inlined rather than
        // shared with queries.ts because everything here must read inside
        // this transaction.)
        const completed = (
          await db.sessions.where('status').equals('completed').toArray()
        )
          .filter((s) => s.id !== sessionId && !s.isDeload)
          .sort((a, b) => b.date.localeCompare(a.date))

        let last: ExerciseHistoryInput['last'] = null
        for (const candidate of completed) {
          const sets = await db.sets
            .where('[sessionId+exerciseId]')
            .equals([candidate.id, exerciseId])
            .sortBy('setIndex')
          if (sets.length === 0) continue

          const feedback = await db.exerciseFeedback
            .where('[sessionId+exerciseId]')
            .equals([candidate.id, exerciseId])
            .first()
          const prescription = await db.prescriptions
            .where('sessionId')
            .equals(candidate.id)
            .filter((row) => row.exerciseId === exerciseId)
            .first()

          last = {
            sets: sets.map((set) => ({ weightLb: set.weightLb, reps: set.reps })),
            pump: feedback?.pump ?? null,
            rir: feedback?.rir ?? null,
            jointPain: feedback?.jointPain ?? null,
            // The never-increase-twice guard resets at a block boundary
            // (PLAN §2.5: a deload isn't an increase, so week one of a new
            // block may add load). History from an earlier mesocycle carries
            // its sets and feedback forward, but not its guard state.
            loadAction:
              candidate.mesocycleId === session.mesocycleId
                ? (prescription?.loadAction ?? null)
                : null,
          }
          break
        }

        const recommendation = recommend({
          exercise: {
            repTargetMin: exercise.repTargetMin,
            repTargetMax: exercise.repTargetMax,
            weightIncrementLb: exercise.weightIncrementLb,
          },
          soreness: sorenessFor(exercise.muscleGroupId),
          last,
          isDeload: session.isDeload,
        })

        rows.push({
          id: newId(),
          mesocycleId: session.mesocycleId,
          sessionId,
          exerciseId,
          weekNumber: session.weekNumber,
          plannedSets: recommendation.sets,
          plannedWeightLb: recommendation.weightLb,
          repTargetMin: recommendation.repTargetMin,
          repTargetMax: recommendation.repTargetMax,
          minRepsToBeat: recommendation.repsToBeat,
          targetRir: recommendation.targetRir,
          loadAction: recommendation.loadAction,
          sentence: recommendation.sentence,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }

      await db.prescriptions.bulkAdd(rows)
    },
  )
}

/**
 * Records today as explicitly skipped (PLAN A-1). A day with a session already
 * underway or finished is left untouched.
 */
export async function skipToday(date: IsoDate, now: Date = new Date()): Promise<Session> {
  const timestamp = now.getTime()

  return db.transaction(
    'rw',
    [db.sessions, db.dayTemplates, db.mesocycles, db.settings],
    async () => {
      const existing = await db.sessions.where('date').equals(date).first()
      if (existing) return existing

      const session = await buildSession(date, 'skipped', timestamp)
      await db.sessions.add(session)
      return session
    },
  )
}

/**
 * Removes a skip, restoring the day to simply untrained. Refuses to touch
 * anything that isn't a skip, and refuses to delete a session that has sets —
 * however they got there — because deleting it would orphan logged work.
 */
export async function undoSkip(date: IsoDate): Promise<void> {
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    const existing = await db.sessions.where('date').equals(date).first()
    if (existing?.status !== 'skipped') return

    const loggedWork = await db.sets
      .where('sessionId')
      .equals(existing.id)
      .count()
    if (loggedWork > 0) return

    await db.sessions.delete(existing.id)
  })
}
