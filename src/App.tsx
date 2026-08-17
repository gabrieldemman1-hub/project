import { useEffect, useState } from 'react'

import { HomeScreen } from './features/home/HomeScreen'
import { seedIfEmpty } from './db/seed'

/**
 * Phase 1 renders one screen. Routing arrives with the session screen in
 * Phase 2 — a hash-based router of about forty lines, rather than a routing
 * dependency, since this app has six screens and needs to work offline from a
 * home-screen icon.
 */
export function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Idempotent — only writes on a genuinely empty database.
    seedIfEmpty().then(
      () => setReady(true),
      (cause: unknown) =>
        setError(cause instanceof Error ? cause : new Error(String(cause))),
    )
  }, [])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="max-w-measure-wide text-center text-sm leading-relaxed text-alert">
          The database could not be opened: {error.message}
        </p>
      </div>
    )
  }

  if (!ready) return <div className="min-h-dvh bg-bg" />

  return <HomeScreen />
}
