/**
 * Local-calendar date helpers.
 *
 * Everything here works in the device's local timezone deliberately: a workout
 * belongs to the day you did it in the gym, not to a UTC day that might roll
 * over mid-evening. Dates are stored as `YYYY-MM-DD` strings, which sort
 * correctly as text and never carry a timezone with them.
 */

import type { IsoDate } from '../db/schema'

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** `YYYY-MM-DD` for a Date, in local time. */
export function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses `YYYY-MM-DD` into a local-midnight Date.
 *
 * Throws on anything malformed rather than returning an Invalid Date, which
 * would otherwise propagate silently — `NaN` days spread through every
 * downstream calculation and surface much later as a blank screen.
 */
export function fromIsoDate(iso: IsoDate): Date {
  const match = ISO_DATE_PATTERN.exec(iso)
  if (!match) throw new Error(`Invalid ISO date: ${iso}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const date = new Date(year, month - 1, day)
  // Catches dates that parse but do not exist, such as 2026-02-30, which the
  // Date constructor would silently roll forward into March.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid ISO date: ${iso}`)
  }

  return date
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: IsoDate): number {
  return fromIsoDate(iso).getDay()
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = fromIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/**
 * The Monday of the week containing `iso`. Weeks run Monday–Sunday because the
 * training rotation starts on Monday and rests on Sunday.
 */
export function startOfWeek(iso: IsoDate): IsoDate {
  const weekday = weekdayOf(iso)
  // Sunday (0) belongs to the week that started six days earlier, not the one
  // starting tomorrow.
  const daysSinceMonday = (weekday + 6) % 7
  return addDays(iso, -daysSinceMonday)
}

/**
 * The Monday of the training week that `iso` belongs to *going forward*.
 *
 * Differs from `startOfWeek` on exactly one day: Sunday. Sunday is the rest
 * day, so for scheduling history it belongs to the week just finished — but a
 * mesocycle created on a Sunday must anchor to the week about to start, or its
 * counter reads "Week 2" the day after installing the app without a single
 * session trained.
 */
export function upcomingTrainingWeekStart(iso: IsoDate): IsoDate {
  return weekdayOf(iso) === 0 ? addDays(iso, 1) : startOfWeek(iso)
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = fromIsoDate(to).getTime() - fromIsoDate(from).getTime()
  return Math.round(ms / 86_400_000)
}

/** e.g. "Monday 17 August". */
export function formatLongDate(iso: IsoDate): string {
  const date = fromIsoDate(iso)
  const weekday = WEEKDAY_NAMES[date.getDay()] ?? ''
  const month = date.toLocaleDateString('en-GB', { month: 'long' })
  return `${weekday} ${date.getDate()} ${month}`
}
