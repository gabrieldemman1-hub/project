import { describe, expect, it } from 'vitest'
import { nextBoundary, resolveTheme, type ThemeSettings } from './theme'

const TODAY = '2026-08-18'
const auto: ThemeSettings = { themeMode: 'auto', themeOverrideDay: null, darkFromHour: 19 }
const at = (h: number, m = 0, day = 18) => new Date(2026, 7, day, h, m)

describe('resolveTheme — the clock rule', () => {
  it('is light in the morning', () => {
    expect(resolveTheme(at(7), auto, TODAY).theme).toBe('light')
  })

  it('is still light one minute before seven', () => {
    expect(resolveTheme(at(18, 59), auto, TODAY).theme).toBe('light')
  })

  it('turns dark exactly at seven — the dark screen IS the signal', () => {
    expect(resolveTheme(at(19, 0), auto, TODAY).theme).toBe('dark')
  })

  it('is dark late at night', () => {
    expect(resolveTheme(at(23, 59), auto, TODAY).theme).toBe('dark')
  })

  it('is light again just after midnight', () => {
    expect(resolveTheme(at(0, 0), auto, TODAY).theme).toBe('light')
  })

  it('honours a different dark-from hour', () => {
    const later = { ...auto, darkFromHour: 21 }
    expect(resolveTheme(at(20), later, TODAY).theme).toBe('light')
    expect(resolveTheme(at(21), later, TODAY).theme).toBe('dark')
  })
})

describe('the manual override', () => {
  it('wins on the day it was set', () => {
    const s: ThemeSettings = { themeMode: 'dark', themeOverrideDay: TODAY, darkFromHour: 19 }
    const r = resolveTheme(at(9), s, TODAY)
    expect(r.theme).toBe('dark')
    expect(r.overrideActive).toBe(true)
  })

  it('forces light after 7pm on the day it was set', () => {
    const s: ThemeSettings = { themeMode: 'light', themeOverrideDay: TODAY, darkFromHour: 19 }
    expect(resolveTheme(at(22), s, TODAY).theme).toBe('light')
  })

  it('is spent by the next day, and the clock takes over again', () => {
    const s: ThemeSettings = { themeMode: 'dark', themeOverrideDay: '2026-08-17', darkFromHour: 19 }
    const r = resolveTheme(at(9), s, TODAY)
    expect(r.theme).toBe('light')
    expect(r.overrideActive).toBe(false)
  })

  it('a mode with no day recorded is not an override', () => {
    const s: ThemeSettings = { themeMode: 'dark', themeOverrideDay: null, darkFromHour: 19 }
    expect(resolveTheme(at(9), s, TODAY).overrideActive).toBe(false)
    expect(resolveTheme(at(9), s, TODAY).theme).toBe('light')
  })
})

describe('nextBoundary — when to re-check the clock', () => {
  it('points at 7pm today when it is morning', () => {
    const b = nextBoundary(at(7), 19)
    expect(b.getHours()).toBe(19)
    expect(b.getDate()).toBe(18)
  })

  it('points at midnight when it is already evening', () => {
    const b = nextBoundary(at(20), 19)
    expect(b.getDate()).toBe(19)
    expect(b.getHours()).toBe(0)
  })

  it('is always in the future', () => {
    for (const h of [0, 6, 12, 18, 19, 23]) {
      expect(nextBoundary(at(h, 30), 19).getTime()).toBeGreaterThan(at(h, 30).getTime())
    }
  })
})
