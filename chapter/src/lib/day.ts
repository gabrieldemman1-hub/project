/**
 * Day keys. PURE — `now` is always passed in, never read from the clock here.
 *
 * A day key is 'YYYY-MM-DD' in the user's LOCAL time, stamped at the moment a
 * row is written and never recomputed. That is what stops travel or a DST
 * transition retroactively re-bucketing history.
 *
 * The brief specifies a local-midnight boundary (SPEC.md 4.5). If reading past
 * midnight ever starts costing streaks, DAY_ROLLOVER_HOUR is the one line to
 * change — every test is written against the constant, not against hardcoded
 * midnights.
 */

export type DayKey = string

export const DAY_ROLLOVER_HOUR = 0

const KEY = /^\d{4}-\d{2}-\d{2}$/

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function assertKey(day: DayKey): void {
  if (!KEY.test(day)) throw new Error(`Not a day key: ${day}`)
}

/** The day a timestamp belongs to, in local time, honouring the rollover hour. */
export function dayKeyOf(at: Date | number): DayKey {
  const d = at instanceof Date ? new Date(at.getTime()) : new Date(at)
  if (Number.isNaN(d.getTime())) throw new Error('dayKeyOf() got an invalid date')
  if (DAY_ROLLOVER_HOUR > 0 && d.getHours() < DAY_ROLLOVER_HOUR) {
    d.setDate(d.getDate() - 1)
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today, from an injected clock. Callers pass `new Date()`; nothing here does. */
export function todayKey(now: Date): DayKey {
  return dayKeyOf(now)
}

/** Parses a day key to a local noon Date — noon so DST shifts can never flip the date. */
export function parseDay(day: DayKey): Date {
  assertKey(day)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

/** Calendar arithmetic, not 86_400_000ms arithmetic — DST-safe by construction. */
export function addDays(day: DayKey, n: number): DayKey {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function diffDays(from: DayKey, to: DayKey): number {
  const ms = parseDay(to).getTime() - parseDay(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function isBefore(a: DayKey, b: DayKey): boolean {
  assertKey(a)
  assertKey(b)
  return a < b
}

export function isSameOrBefore(a: DayKey, b: DayKey): boolean {
  assertKey(a)
  assertKey(b)
  return a <= b
}

/** Inclusive range, used by the streak and simulation code. */
export function daysBetween(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = []
  let cursor = from
  const guard = Math.abs(diffDays(from, to)) + 1
  for (let i = 0; i < guard; i++) {
    out.push(cursor)
    if (cursor === to) break
    cursor = addDays(cursor, 1)
  }
  return out
}
