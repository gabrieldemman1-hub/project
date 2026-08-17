import { Suspense, lazy, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { HomeScreen } from './features/home/HomeScreen'
import { SessionScreen } from './features/session/SessionScreen'
import { LockScreen } from './features/settings/LockScreen'
import { getSettings } from './db/queries'
import { seedIfEmpty } from './db/seed'
import { useRoute } from './lib/router'
import { colors, lightColors } from './styles/tokens'

// Charts are the one heavy dependency, and the brief's cold-open budget is
// three seconds to the first logged set — so Recharts only downloads when the
// history screen is actually opened, never on the way to a workout.
const HistoryScreen = lazy(() =>
  import('./features/history/HistoryScreen').then((module) => ({
    default: module.HistoryScreen,
  })),
)
const SettingsScreen = lazy(() =>
  import('./features/settings/SettingsScreen').then((module) => ({
    default: module.SettingsScreen,
  })),
)

/** Unlock survives reloads within the browser session, never across opens. */
const UNLOCK_KEY = 'workout-unlocked'

export function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(UNLOCK_KEY) === '1',
  )
  const route = useRoute()

  useEffect(() => {
    // Idempotent — only writes on a genuinely empty database.
    seedIfEmpty().then(
      () => setReady(true),
      (cause: unknown) =>
        setError(cause instanceof Error ? cause : new Error(String(cause))),
    )
  }, [])

  // Theme follows settings live; components only ever see token names.
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const theme = settings?.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? lightColors.bg : colors.bg)
  }, [theme])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="max-w-measure-wide text-center text-sm leading-relaxed text-alert">
          The database could not be opened: {error.message}
        </p>
      </div>
    )
  }

  if (!ready || settings === undefined) return <div className="min-h-dvh bg-bg" />

  const lock = settings?.appLock ?? null
  // Re-read the flag each render: the Settings screen marks the session
  // trusted at the moment it installs a lock.
  if (lock && !unlocked && sessionStorage.getItem(UNLOCK_KEY) !== '1') {
    return (
      <LockScreen
        lock={lock}
        onUnlock={() => {
          sessionStorage.setItem(UNLOCK_KEY, '1')
          setUnlocked(true)
        }}
      />
    )
  }

  return route === '/session' ? (
    <SessionScreen />
  ) : route === '/history' ? (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <HistoryScreen />
    </Suspense>
  ) : route === '/settings' ? (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <SettingsScreen />
    </Suspense>
  ) : (
    <HomeScreen />
  )
}
