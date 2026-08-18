/**
 * Theme resolution. PURE — `now` is always a parameter.
 *
 * Light by day, near-black from 19:00. The dark screen is itself the signal
 * that it is recall time, so this is product logic, not decoration.
 */
import type { DayKey } from './day'

export type Theme = 'light' | 'dark'
export type ThemeMode = 'auto' | 'light' | 'dark'

export interface ThemeSettings {
  themeMode: ThemeMode
  /** The day a manual choice was made. It expires at the next local midnight. */
  themeOverrideDay: DayKey | null
  darkFromHour: number
}

export interface ResolvedTheme {
  theme: Theme
  overrideActive: boolean
}

export function resolveTheme(now: Date, settings: ThemeSettings, today: DayKey): ResolvedTheme {
  const overrideActive =
    settings.themeMode !== 'auto' && settings.themeOverrideDay === today

  if (overrideActive) {
    return { theme: settings.themeMode === 'dark' ? 'dark' : 'light', overrideActive: true }
  }
  return {
    theme: now.getHours() >= settings.darkFromHour ? 'dark' : 'light',
    overrideActive: false,
  }
}

/**
 * The next moment the resolved theme could change: 19:00 today if it is still
 * morning, otherwise the next midnight. Used to arm a single timer instead of
 * polling the clock.
 */
export function nextBoundary(now: Date, darkFromHour: number): Date {
  const next = new Date(now.getTime())
  next.setMinutes(0, 0, 0)
  if (now.getHours() < darkFromHour) {
    next.setHours(darkFromHour)
  } else {
    next.setDate(next.getDate() + 1)
    next.setHours(0)
  }
  return next
}
