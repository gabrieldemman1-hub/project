/**
 * Which day of the rotation falls on a given date, and where that date sits in
 * the current mesocycle.
 *
 * Pure functions — they take data in and return answers, with no database
 * access — so they can be tested without a browser. The database reads live in
 * `src/db/queries.ts`.
 */

import type { DayTemplate, IsoDate, Mesocycle, Session } from '../db/schema'
import { addDays, daysBetween, startOfWeek, toIsoDate, weekdayOf } from './date'

/** Sunday is the rest day (BRIEF.md Part 4: six days a week, Sunday off). */
export const REST_WEEKDAY = 0

/**
 * The day template scheduled for a date, or null on a rest day.
 *
 * Weekdays are locked: Mon/Thu = A, Tue/Fri = B, Wed/Sat = C, always. A missed
 * session does not shift the rotation — it is recorded as skipped and the
 * calendar carries on (PLAN.md A-1).
 */
export function templateForDate(
  templates: readonly DayTemplate[],
  date: IsoDate,
): DayTemplate | null {
  const weekday = weekdayOf(date)
  return templates.find((template) => template.weekdays.includes(weekday)) ?? null
}

export function isRestDay(
  templates: readonly DayTemplate[],
  date: IsoDate,
): boolean {
  return templateForDate(templates, date) === null
}

export interface MesocyclePosition {
  /** 1-based, clamped to the block length. */
  weekNumber: number
  totalWeeks: number
  isDeloadWeek: boolean
  /**
   * True once the block has run past its final week. The app then waits for the
   * user to start the next one rather than rolling over on its own (PLAN.md A-4).
   */
  isComplete: boolean
}

/**
 * Where `date` sits in `mesocycle`. Weeks are calendar weeks measured from the
 * Monday the block started, so the answer does not depend on how many sessions
 * were actually completed.
 */
export function mesocyclePosition(
  mesocycle: Mesocycle,
  date: IsoDate,
): MesocyclePosition {
  const weeksElapsed = Math.floor(
    daysBetween(startOfWeek(mesocycle.startDate), startOfWeek(date)) / 7,
  )
  const rawWeek = weeksElapsed + 1
  const isComplete = rawWeek > mesocycle.totalWeeks
  // Before the start date (possible if the user back-dates a block) clamps to 1.
  const weekNumber = Math.min(Math.max(rawWeek, 1), mesocycle.totalWeeks)

  return {
    weekNumber,
    totalWeeks: mesocycle.totalWeeks,
    // A finished block is not a deload — it is over, pending a manual restart.
    isDeloadWeek: !isComplete && weekNumber === mesocycle.deloadWeek,
    isComplete,
  }
}

/**
 * Consecutive scheduled training days completed, counting back from `date`.
 *
 * Sundays are stepped over rather than breaking the run, since they are rest
 * days. An explicit skip breaks it, as does a scheduled day with no completed
 * session. Today not being logged yet does not break it either — the count
 * simply starts from the most recent day that was.
 */
export function currentStreak(
  templates: readonly DayTemplate[],
  sessions: readonly Session[],
  date: IsoDate,
): number {
  const statusByDate = new Map(sessions.map((s) => [s.date, s.status]))
  const completedDates = new Set(
    sessions.filter((s) => s.status === 'completed').map((s) => s.date),
  )
  if (completedDates.size === 0) return 0

  let streak = 0
  let cursor = date

  if (!completedDates.has(cursor)) {
    // Deciding to skip today breaks the run immediately. Not having trained
    // *yet* does not — so these two cases must be told apart, and only the
    // absence of a decision earns the grace.
    if (statusByDate.get(cursor) === 'skipped') return 0
    cursor = addDays(cursor, -1)
  }

  // Bounded so a corrupt date can never spin: a year of history is far more
  // than any streak display needs.
  for (let i = 0; i < 366; i += 1) {
    if (isRestDay(templates, cursor)) {
      cursor = addDays(cursor, -1)
      continue
    }
    if (!completedDates.has(cursor)) break
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return streak
}

/** Today, as a local `YYYY-MM-DD`. Injectable so tests never depend on the clock. */
export function today(now: Date = new Date()): IsoDate {
  return toIsoDate(now)
}
