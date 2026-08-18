import { useEffect, useRef, useState } from 'react'
import { ProgressBar } from './ProgressBar'

interface Props {
  title: string
  /** Shown counting up from `from` to `to`. */
  from: number
  to: number
  detail?: string
  onDone: () => void
  /** Milliseconds the overlay stays up before auto-dismissing. */
  holdMs?: number
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * The celebration, twice a day: once when a chapter lands, once when the night
 * session closes. Restrained on purpose — a bar that fills and a number that
 * ticks. No confetti. Tap anywhere to dismiss early.
 */
export function Celebration({ title, from, to, detail, onDone, holdMs = 1600 }: Props) {
  const [shown, setShown] = useState(from)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(to)
    } else {
      const start = performance.now()
      const span = 600
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / span)
        // ease-out, so it lands softly rather than stopping dead
        setShown(from + (to - from) * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    }
    const timer = setTimeout(onDone, holdMs)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      clearTimeout(timer)
    }
  }, [from, to, holdMs, onDone])

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDone}
      className="fixed inset-0 z-50 flex items-center justify-center px-8"
      style={{ background: 'var(--overlay)' }}
      data-testid="celebration"
    >
      <div className="w-full max-w-sm bg-surface rounded-[var(--radius-lg)] p-7 text-center border border-border-soft">
        <p className="text-lg font-medium">{title}</p>
        <p className="text-5xl font-semibold tnum text-accent-ink mt-4 mb-4">
          {Math.round(shown)}
          <span className="text-2xl">%</span>
        </p>
        <ProgressBar percent={shown} celebrate label="Book progress" />
        {detail && <p className="text-sm text-ink-quiet mt-4 leading-relaxed">{detail}</p>}
      </div>
    </div>
  )
}
