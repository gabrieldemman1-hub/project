import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  onChange: (n: number) => void
  step?: number
  /** Long-press multiplier — holding moves 10x, for paging through a book. */
  fastStep?: number
  min?: number
  max?: number
  suffix?: string
  label: string
}

/**
 * Steppers first, keyboards second. This is used one-handed, half awake.
 * Tapping the number turns it into an input for the times a stepper is silly
 * (jumping from page 12 to page 240).
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  fastStep,
  min = 0,
  max = 100000,
  suffix,
  label,
}: Props) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const clamp = (n: number) => Math.max(min, Math.min(max, n))

  useEffect(() => {
    if (typing) inputRef.current?.focus()
  }, [typing])

  useEffect(() => () => stopHold(), [])

  function stopHold() {
    if (holdRef.current) {
      clearInterval(holdRef.current)
      holdRef.current = null
    }
  }

  function bump(direction: 1 | -1) {
    onChange(clamp(value + direction * step))
  }

  function startHold(direction: 1 | -1) {
    stopHold()
    const jump = fastStep ?? step * 10
    holdRef.current = setInterval(() => {
      onChange(clamp(valueRef.current + direction * jump))
    }, 140)
  }

  // Interval closures need the live value, not the one captured at press time.
  const valueRef = useRef(value)
  valueRef.current = value

  function commitDraft() {
    const parsed = Number(draft.replace(/[^0-9.]/g, ''))
    onChange(Number.isFinite(parsed) ? clamp(parsed) : value)
    setTyping(false)
  }

  return (
    <div className="flex items-stretch gap-2" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className="w-14 rounded-[var(--radius-md)] bg-surface border border-border-soft text-2xl text-ink-quiet"
        onClick={() => bump(-1)}
        onPointerDown={() => startHold(-1)}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
      >
        −
      </button>

      <div className="flex-1 flex items-center justify-center rounded-[var(--radius-md)] bg-surface border border-border-soft min-h-14">
        {typing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={draft}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => e.key === 'Enter' && commitDraft()}
            className="w-full text-center text-3xl font-semibold tnum bg-transparent outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`${label}: ${value}. Tap to type.`}
            className="w-full h-full text-3xl font-semibold tnum"
            onClick={() => {
              setDraft(String(value))
              setTyping(true)
            }}
          >
            {value}
            {suffix && <span className="text-base text-ink-quiet ml-0.5">{suffix}</span>}
          </button>
        )}
      </div>

      <button
        type="button"
        aria-label={`Increase ${label}`}
        className="w-14 rounded-[var(--radius-md)] bg-surface border border-border-soft text-2xl text-ink-quiet"
        onClick={() => bump(1)}
        onPointerDown={() => startHold(1)}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
      >
        +
      </button>
    </div>
  )
}
