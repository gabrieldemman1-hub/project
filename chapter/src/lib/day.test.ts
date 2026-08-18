import { describe, expect, it } from 'vitest'
import {
  DAY_ROLLOVER_HOUR,
  addDays,
  dayKeyOf,
  daysBetween,
  diffDays,
  isBefore,
  parseDay,
  todayKey,
} from './day'

describe('dayKeyOf', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(dayKeyOf(new Date(2026, 7, 18, 9, 30))).toBe('2026-08-18')
  })

  it('pads single-digit months and days', () => {
    expect(dayKeyOf(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })

  it('puts one minute before midnight on the earlier day', () => {
    expect(dayKeyOf(new Date(2026, 7, 18, 23, 59))).toBe('2026-08-18')
  })

  it('puts one minute after midnight on the later day — the brief chose local midnight', () => {
    expect(DAY_ROLLOVER_HOUR).toBe(0)
    expect(dayKeyOf(new Date(2026, 7, 19, 0, 1))).toBe('2026-08-19')
  })

  it('rejects an invalid date rather than emitting NaN-NaN-NaN', () => {
    expect(() => dayKeyOf(new Date('nonsense'))).toThrow()
  })
})

describe('todayKey', () => {
  it('reads the clock it is handed, never a global one', () => {
    expect(todayKey(new Date(2026, 2, 1, 8))).toBe('2026-03-01')
  })
})

describe('addDays / diffDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('goes backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('survives a spring-forward DST transition without an off-by-one', () => {
    // US DST springs forward on 2026-03-08. Naive 86_400_000ms arithmetic
    // returns 2026-03-08 twice here; calendar arithmetic does not.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2)
  })

  it('survives a fall-back DST transition', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2)
  })

  it('measures the interval ladder correctly', () => {
    expect(diffDays('2026-08-18', addDays('2026-08-18', 30))).toBe(30)
  })

  it('returns a negative difference when the target is earlier', () => {
    expect(diffDays('2026-08-18', '2026-08-11')).toBe(-7)
  })
})

describe('parseDay', () => {
  it('anchors at local noon so a DST shift cannot flip the date', () => {
    expect(parseDay('2026-03-08').getHours()).toBe(12)
    expect(parseDay('2026-03-08').getDate()).toBe(8)
  })

  it('rejects a malformed key', () => {
    expect(() => parseDay('18-08-2026')).toThrow()
  })
})

describe('isBefore / daysBetween', () => {
  it('compares lexicographically, which is chronological for this format', () => {
    expect(isBefore('2026-08-17', '2026-08-18')).toBe(true)
    expect(isBefore('2026-08-18', '2026-08-18')).toBe(false)
    expect(isBefore('2026-09-01', '2026-08-31')).toBe(false)
  })

  it('enumerates an inclusive range', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ])
  })

  it('returns a single day when both ends match', () => {
    expect(daysBetween('2026-08-18', '2026-08-18')).toEqual(['2026-08-18'])
  })
})
