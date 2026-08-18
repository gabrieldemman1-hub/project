import { useEffect, useState } from 'react'
import { nextBoundary, resolveTheme, type Theme, type ThemeSettings } from './theme'
import { todayKey } from './day'
import { DARK, LIGHT, THEME_COLOR } from '../styles/tokens'

function applyToDocument(theme: Theme) {
  const root = document.documentElement
  root.dataset['theme'] = theme
  // Native controls (form fields, scrollbars) follow color-scheme, not our
  // tokens. Without this they stay light after 19:00 and look pasted on.
  root.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
  // Belt and braces: the body background is what shows during overscroll and
  // behind the launch screen.
  document.body.style.backgroundColor = theme === 'dark' ? DARK.ground : LIGHT.ground
}

/**
 * Resolves the theme from the clock and the stored settings, applies it, and
 * re-checks at three moments: on mount, when the app becomes visible again, and
 * on a timer armed for the next boundary. All three call the same pure
 * `resolveTheme`, so they cannot disagree.
 *
 * The visibility check is the one that matters on iOS, where the app is
 * discarded and relaunched constantly — a timer armed at 6pm may never fire.
 */
export function useTheme(settings: ThemeSettings | undefined): Theme {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    if (!settings) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const evaluate = () => {
      const now = new Date()
      const resolved = resolveTheme(now, settings, todayKey(now))
      setTheme(resolved.theme)
      applyToDocument(resolved.theme)

      if (timer) clearTimeout(timer)
      const boundary = nextBoundary(now, settings.darkFromHour)
      // Cap the timer: a multi-day sleep is unreliable, and visibility handles it.
      const delay = Math.min(boundary.getTime() - now.getTime() + 1000, 6 * 60 * 60 * 1000)
      timer = setTimeout(evaluate, Math.max(delay, 1000))
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') evaluate()
    }

    evaluate()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [settings?.themeMode, settings?.themeOverrideDay, settings?.darkFromHour])

  return theme
}
