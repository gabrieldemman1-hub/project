import { db } from './db'
import { newId } from '../lib/ids'
import { dayKeyOf, daysBetween, type DayKey } from '../lib/day'
import {
  buildSession,
  firstReview,
  nextReview,
  soonestDue,
  type Grade,
  type NextReview,
  type PendingReview,
  type SessionQueue,
} from '../lib/scheduler'
import type { Note, Review, ReviewSession } from './schema'

/** The one pending review row that every live note carries. */
export async function pendingReviews(): Promise<PendingReview[]> {
  const rows = await db.reviews.where('pending').equals(1).toArray()
  return rows.map((r) => ({
    id: r.id,
    noteId: r.noteId,
    dueDate: r.dueDate,
    intervalIndex: r.intervalIndex,
  }))
}

export function reviewRowFor(noteId: string, next: NextReview, now: number): Review {
  return {
    id: newId('rv'),
    noteId,
    dueDate: next.dueDate,
    intervalIndex: next.intervalIndex,
    result: null,
    pending: 1,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Called when a note is created. One pending row, from the first moment. */
export async function scheduleFirstReview(note: Note, now = Date.now()): Promise<Review> {
  const row = reviewRowFor(note.id, firstReview(note.dayKey), now)
  await db.reviews.add(row)
  return row
}

export interface GradeOutcome {
  next: NextReview
  noteId: string
}

/**
 * Grades one review.
 *
 * Replay-safe on purpose. Tap-to-reveal-then-grade, with a slow write and an
 * OS that suspends the app aggressively, is exactly where a retried mutation
 * would advance a note two rungs up the ladder. The row is re-read INSIDE the
 * transaction and a second write is a no-op rather than a double advance.
 *
 * Closing the open row and inserting the new one happen in the same
 * transaction, so a note can never end up with zero or two pending reviews.
 */
export async function gradeReview(
  reviewId: string,
  grade: Grade,
  reviewedOn: DayKey,
  now = Date.now(),
): Promise<GradeOutcome | null> {
  return db.transaction('rw', db.reviews, async () => {
    const row = await db.reviews.get(reviewId)
    if (!row || row.pending !== 1) return null // already graded — do nothing

    const next = nextReview({ intervalIndex: row.intervalIndex }, grade, reviewedOn)

    await db.reviews.update(reviewId, {
      result: grade,
      pending: 0,
      reviewedAt: now,
      updatedAt: now,
    })
    await db.reviews.add(reviewRowFor(row.noteId, next, now))

    return { next, noteId: row.noteId }
  })
}

export interface TonightsQueue extends SessionQueue {
  /** Reviews already graded today, across every session. */
  alreadyDone: number
  /** True when the night's allowance is spent but notes remain due. */
  capReached: boolean
}

/** Reviews graded today, whichever session they happened in. */
export async function gradedTodayCount(today: DayKey): Promise<number> {
  const rows = await db.reviews.where('pending').equals(0).toArray()
  return rows.filter((r) => r.reviewedAt !== null && dayKeyOf(r.reviewedAt) === today).length
}

/**
 * Tonight's queue, capped for the NIGHT rather than for the session.
 *
 * A per-session cap would be no cap at all: finish tonight's five and you could
 * immediately start a second session and be handed five more, which is exactly
 * the punishing backlog the cap exists to prevent. The allowance is what is
 * left of `cap` after everything already graded today.
 */
export async function tonightsQueue(today: DayKey, cap: number): Promise<TonightsQueue> {
  const alreadyDone = await gradedTodayCount(today)
  const remaining = Math.max(0, cap - alreadyDone)
  const base = buildSession(await pendingReviews(), today, remaining)
  return {
    ...base,
    alreadyDone,
    capReached: remaining === 0 && base.dueCount > 0,
  }
}

/** Resumes today's unfinished session, or opens a new one and freezes its queue. */
export async function openOrResumeSession(
  today: DayKey,
  cap: number,
  now = Date.now(),
): Promise<ReviewSession> {
  const existing = await db.sessions.where('dayKey').equals(today).toArray()
  const open = existing.find((s) => s.kind === 'review' && s.endedAt === null)
  if (open) return open

  const queue = await tonightsQueue(today, cap)
  const session: ReviewSession = {
    id: newId('ss'),
    kind: 'review',
    dayKey: today,
    tzOffsetMinutes: new Date(now).getTimezoneOffset(),
    startedAt: now,
    endedAt: null,
    reviewIds: queue.queue.map((r) => r.id),
    currentIndex: 0,
    revealed: false,
    served: queue.queue.length,
    graded: 0,
    heldBack: queue.heldBack,
    dueCount: queue.dueCount,
    updatedAt: now,
  }
  await db.sessions.add(session)
  return session
}

/** Pulls forward the soonest-due notes when nothing is due tonight. */
export async function openEarlySession(
  today: DayKey,
  cap: number,
  now = Date.now(),
): Promise<ReviewSession> {
  const queue = soonestDue(await pendingReviews(), today, cap)
  const session: ReviewSession = {
    id: newId('ss'),
    kind: 'review',
    dayKey: today,
    tzOffsetMinutes: new Date(now).getTimezoneOffset(),
    startedAt: now,
    endedAt: null,
    reviewIds: queue.map((r) => r.id),
    currentIndex: 0,
    revealed: false,
    served: queue.length,
    graded: 0,
    heldBack: 0,
    dueCount: 0,
    updatedAt: now,
  }
  await db.sessions.add(session)
  return session
}

export async function saveSessionProgress(
  sessionId: string,
  patch: Partial<Pick<ReviewSession, 'currentIndex' | 'revealed' | 'graded'>>,
  now = Date.now(),
): Promise<void> {
  await db.sessions.update(sessionId, { ...patch, updatedAt: now })
}

/**
 * Closes the session. This — not an individual grade — is what the review
 * streak counts, so abandoning a session must still close it if any work was
 * done, or the user loses a night they actually earned.
 */
export async function closeSession(sessionId: string, now = Date.now()): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session || session.endedAt !== null) return
  await db.sessions.update(sessionId, { endedAt: now, updatedAt: now })
}

/** Discards a session nobody graded anything in, so it cannot claim a streak night. */
export async function abandonSession(sessionId: string): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session || session.endedAt !== null) return
  if (session.graded > 0) {
    await closeSession(sessionId)
  } else {
    await db.sessions.delete(sessionId)
  }
}

/**
 * Nights on which nothing was due.
 *
 * With intervals of 1/3/7/14/30 a light reading week routinely produces empty
 * nights. These bridge the review streak without inflating it, so the user is
 * not punished for the scheduler's arithmetic.
 *
 * Reconstructed from the review log: a review was outstanding on day D if it
 * was due on or before D and had not yet been graded by then.
 */
export async function daysWithNothingDue(from: DayKey, to: DayKey): Promise<DayKey[]> {
  const rows = await db.reviews.toArray()
  if (rows.length === 0) return []

  const out: DayKey[] = []
  for (const day of daysBetween(from, to)) {
    const outstanding = rows.some(
      (r) =>
        r.dueDate <= day &&
        (r.reviewedAt === null || dayKeyOf(r.reviewedAt) >= day),
    )
    if (!outstanding) out.push(day)
  }
  return out
}

export async function notesByIds(ids: string[]): Promise<Map<string, Note>> {
  const notes = await db.notes.bulkGet(ids)
  const map = new Map<string, Note>()
  for (const n of notes) if (n) map.set(n.id, n)
  return map
}

export async function reviewsByIds(ids: string[]): Promise<Map<string, Review>> {
  const rows = await db.reviews.bulkGet(ids)
  const map = new Map<string, Review>()
  for (const r of rows) if (r) map.set(r.id, r)
  return map
}
