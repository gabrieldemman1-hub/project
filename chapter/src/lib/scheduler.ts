/**
 * The review scheduler. PURE — no database, no clock. The current day is always
 * a parameter.
 *
 * Intervals are +1, +3, +7, +14, +30 days, each measured from the PREVIOUS
 * review rather than from note creation. The brief says "from note creation"
 * but also asserts that five correct grades puts a note 55 days out, and
 * 1+3+7+14+30 = 55 — only the cumulative reading produces that number. See
 * SPEC.md 4.1. Due days from creation are therefore 1, 4, 11, 25, 55.
 */
import { addDays, isSameOrBefore, type DayKey } from './day'

export const INTERVALS = [1, 3, 7, 14, 30] as const
export type Grade = 'got_it' | 'partial' | 'missed'

const TOP = INTERVALS.length - 1

export interface PendingReview {
  id: string
  noteId: string
  dueDate: DayKey
  intervalIndex: number
}

export interface NextReview {
  intervalIndex: number
  dueDate: DayKey
  intervalDays: number
  /** One plain line, stored with the review so it is never regenerated. */
  sentence: string
}

export interface SessionQueue {
  /** At most `cap`, ordered oldest-due first. */
  queue: PendingReview[]
  /** Everything due today or earlier, before the cap. */
  dueCount: number
  /** Due strictly before today. */
  overdueCount: number
  heldBack: number
  nothingDue: boolean
}

function clampIndex(i: number): number {
  if (!Number.isFinite(i)) return 0
  return Math.max(0, Math.min(TOP, Math.trunc(i)))
}

function intervalFor(index: number): number {
  return INTERVALS[clampIndex(index)] ?? 1
}

export function describeInterval(days: number): string {
  if (days === 1) return 'tomorrow'
  if (days === 30) return 'in a month'
  if (days === 14) return 'in a fortnight'
  return `in ${days} days`
}

/** A note is never reviewed on the day it was written — that is rereading. */
export function firstReview(createdDay: DayKey): NextReview {
  const intervalDays = intervalFor(0)
  return {
    intervalIndex: 0,
    dueDate: addDays(createdDay, intervalDays),
    intervalDays,
    sentence: `New note — first look ${describeInterval(intervalDays)}.`,
  }
}

/**
 * The next due date is always measured from `reviewedOn`, the day the review
 * actually happened, never from the day it was due. Anchoring to a missed due
 * date would leave a note overdue after the work was done, and one skipped week
 * would compress every interval after it.
 */
export function nextReview(
  current: { intervalIndex: number },
  grade: Grade,
  reviewedOn: DayKey,
): NextReview {
  const index = clampIndex(current.intervalIndex)

  const nextIndex = grade === 'got_it' ? Math.min(index + 1, TOP) : grade === 'partial' ? index : 0
  const intervalDays = intervalFor(nextIndex)
  const when = describeInterval(intervalDays)

  const sentence =
    grade === 'got_it'
      ? nextIndex === index
        ? `Got it — staying monthly, back ${when}.`
        : `Got it — back ${when}.`
      : grade === 'partial'
        ? `Partial — same gap again, back ${when}.`
        : `Missed — back ${when}, from the start.`

  return { intervalIndex: nextIndex, dueDate: addDays(reviewedOn, intervalDays), intervalDays, sentence }
}

/**
 * Ordering: oldest due date first, then weakest note, then id. The id backstop
 * makes the sort total, so the five notes chosen from a backlog of forty are
 * the same five on every run and the test can assert an exact sequence.
 */
function order(a: PendingReview, b: PendingReview): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  if (a.intervalIndex !== b.intervalIndex) return a.intervalIndex - b.intervalIndex
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Tonight's queue.
 *
 * The cap is what stops a backlog feeling punishing: come back from a week away
 * to forty due notes and you are shown five, oldest first. The held-back count
 * is returned so the screen can say so plainly — a silent cap would be a lie.
 */
export function buildSession(
  allPending: readonly PendingReview[],
  today: DayKey,
  cap: number,
): SessionQueue {
  const due = allPending.filter((r) => isSameOrBefore(r.dueDate, today))
  // Sort a copy: the caller's array is not ours to reorder.
  const sorted = [...due].sort(order)
  const queue = sorted.slice(0, Math.max(0, cap))

  return {
    queue,
    dueCount: due.length,
    overdueCount: due.filter((r) => r.dueDate < today).length,
    heldBack: due.length - queue.length,
    nothingDue: due.length === 0,
  }
}

/**
 * For "nothing is due, but I want to review anyway". Explicitly separate from
 * buildSession, which must never pull a future note forward on its own.
 */
export function soonestDue(
  allPending: readonly PendingReview[],
  today: DayKey,
  limit: number,
): PendingReview[] {
  void today
  return [...allPending].sort(order).slice(0, Math.max(0, limit))
}
