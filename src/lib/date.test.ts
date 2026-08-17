import { describe, expect, it } from 'vitest'

import {
  addDays,
  daysBetween,
  formatLongDate,
  fromIsoDate,
  startOfWeek,
  toIsoDate,
  weekdayOf,
} from './date'

describe('toIsoDate / fromIsoDate', () => {
  it('round-trips a local date without drifting across a timezone', () => {
    const date = new Date(2026, 7, 17, 23, 30)
    expect(toIsoDate(date)).toBe('2026-08-17')
    expect(toIsoDate(fromIsoDate('2026-08-17'))).toBe('2026-08-17')
  })

  it('pads single-digit months and days', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('rejects a malformed date rather than producing a silent Invalid Date', () => {
    expect(() => fromIsoDate('not-a-date')).toThrow()
    expect(() => fromIsoDate('')).toThrow()
    expect(() => fromIsoDate('2026-8-17')).toThrow()
    expect(() => fromIsoDate('2026-08-17T10:00:00Z')).toThrow()
  })

  it('rejects a date that does not exist instead of rolling it forward', () => {
    // new Date(2026, 1, 30) silently becomes 2 March, which would corrupt every
    // calculation downstream of it.
    expect(() => fromIsoDate('2026-02-30')).toThrow()
    expect(() => fromIsoDate('2026-13-01')).toThrow()
  })
})

describe('weekdayOf', () => {
  it('maps the reference week, Sunday = 0', () => {
    expect(weekdayOf('2026-08-16')).toBe(0) // Sunday
    expect(weekdayOf('2026-08-17')).toBe(1) // Monday
    expect(weekdayOf('2026-08-22')).toBe(6) // Saturday
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('goes backwards across a year boundary', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('startOfWeek', () => {
  it('returns the Monday for every day of a training week', () => {
    for (const date of [
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
    ]) {
      expect(startOfWeek(date)).toBe('2026-08-17')
    }
  })

  it('treats Sunday as the end of the week it rests, not the start of the next', () => {
    // Sunday is the program's rest day, so it must belong to the week that just
    // finished — otherwise the mesocycle counter would tick over a day early.
    expect(startOfWeek('2026-08-23')).toBe('2026-08-17')
  })
})

describe('daysBetween', () => {
  it('counts forwards and backwards', () => {
    expect(daysBetween('2026-08-17', '2026-08-24')).toBe(7)
    expect(daysBetween('2026-08-24', '2026-08-17')).toBe(-7)
    expect(daysBetween('2026-08-17', '2026-08-17')).toBe(0)
  })

  it('is unaffected by a daylight-saving transition', () => {
    // UK clocks go back on 25 October 2026, making one day 25 hours long.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('formatLongDate', () => {
  it('reads as a date a human would say out loud', () => {
    expect(formatLongDate('2026-08-17')).toBe('Monday 17 August')
  })
})
