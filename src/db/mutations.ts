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
import type { CardioEntry, IsoDate, Session } from './schema'
import { newId } from '../lib/ids'
import { mesocyclePosition, templateForDate } from '../lib/schedule'

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
        prescribedWeightLb: null,
        prescribedReps: null,
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
 * anything that isn't a skip — a session with logged work is never deleted.
 */
export async function undoSkip(date: IsoDate): Promise<void> {
  await db.transaction('rw', [db.sessions], async () => {
    const existing = await db.sessions.where('date').equals(date).first()
    if (existing?.status === 'skipped') {
      await db.sessions.delete(existing.id)
    }
  })
}
