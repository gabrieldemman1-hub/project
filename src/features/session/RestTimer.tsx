import { useEffect, useState } from 'react'

/** Geometry shared by the ring and its label. */
const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * The rest countdown — the signature glowing element of the session screen
 * (BRIEF Part 7). Appears automatically when a set is logged, counts down
 * smoothly, dismissible with one tap, and auto-dismisses shortly after zero.
 *
 * Time derives from an absolute end timestamp rather than a decrementing
 * counter, so a re-render, a backgrounded tab or a slow interval can never
 * make it drift.
 */
export function RestTimer({
  endsAt,
  totalSeconds,
  onDismiss,
}: {
  endsAt: number
  totalSeconds: number
  onDismiss: () => void
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [])

  const remainingMs = Math.max(0, endsAt - now)
  const remaining = Math.ceil(remainingMs / 1000)
  const done = remainingMs === 0

  // Once done, linger briefly so the zero is seen, then get out of the way.
  useEffect(() => {
    if (!done) return
    const timeout = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timeout)
  }, [done, onDismiss])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const progress = totalSeconds > 0 ? remainingMs / (totalSeconds * 1000) : 0

  return (
    <div
      role="timer"
      aria-label={done ? 'Rest done' : `Rest: ${minutes}:${String(seconds).padStart(2, '0')} remaining`}
      // z-50: the action bar creates its own stacking context and sits later
      // in the DOM, so without an explicit layer the timer paints underneath
      // it and its Dismiss button is untappable. Caught by prove-resume.ts.
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-surface px-6 pt-8"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + var(--spacing-8))' }}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="relative rounded-full shadow-ring">
          <svg width={128} height={128} viewBox="0 0 128 128" aria-hidden>
            <circle
              cx="64"
              cy="64"
              r={RADIUS}
              fill="none"
              strokeWidth="4"
              className="stroke-border"
            />
            <circle
              cx="64"
              cy="64"
              r={RADIUS}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-accent"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              transform="rotate(-90 64 64)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="num text-2xl text-text">
              {done ? '0:00' : `${minutes}:${String(seconds).padStart(2, '0')}`}
            </span>
          </div>
        </div>

        <p className="text-xs tracking-wider text-text-secondary uppercase">
          {done ? 'Rest done — next set' : 'Resting'}
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="min-h-touch-min w-full rounded-md border border-border bg-surface-raised text-sm text-text-secondary"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
