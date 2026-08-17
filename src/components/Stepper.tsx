import { useEffect, useRef, useState } from 'react'

/**
 * The primary input of the whole app: steppers first, keyboard second
 * (CLAUDE.md). Minus and plus are full-height touch targets well above the
 * 44px floor because they're hit one-handed, standing, between sets; tapping
 * the value itself opens a numeric field for the tap-to-type fallback.
 */
export function Stepper({
  label,
  value,
  step,
  min = 0,
  unit,
  highlight = false,
  onChange,
}: {
  label: string
  value: number
  step: number
  min?: number
  unit?: string
  /**
   * Marks this stepper as the thing that needs a number before anything else
   * can happen — an accent edge on the value, not a glow, so the screen's
   * two-glow budget (Part 7) is untouched.
   */
  highlight?: boolean
  onChange: (next: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function commitDraft() {
    const trimmed = draft.trim()
    // An emptied field is a cancelled edit, not zero — Number('') is 0, which
    // would silently wipe the previous value.
    if (trimmed !== '') {
      const parsed = Number(trimmed.replace(',', '.'))
      if (Number.isFinite(parsed) && parsed >= min) {
        // The typed value is kept exactly as typed. The keyboard fallback
        // exists for weights the stepper grid can't reach — 2.5 lb magnet
        // plates, odd stacks — so snapping it to the increment would record a
        // weight that was never lifted. The + and − buttons simply step from
        // whatever was typed.
        onChange(parsed)
      }
    }
    setEditing(false)
  }

  // Weights can be fractional (2.5 lb steps exist); show one decimal only
  // when it carries information.
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1)

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
        className="num min-h-touch-comfortable min-w-touch-comfortable rounded-md border border-border bg-surface-raised text-xl text-text active:bg-surface disabled:opacity-30"
      >
        −
      </button>

      {editing ? (
        <input
          ref={inputRef}
          aria-label={label}
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitDraft()
            if (event.key === 'Escape') setEditing(false)
          }}
          className="num min-h-touch-comfortable w-full min-w-0 flex-1 rounded-md border border-border-strong bg-surface text-center text-2xl text-text outline-none"
        />
      ) : (
        <button
          type="button"
          aria-label={`${label}: ${shown}${unit ? ` ${unit}` : ''}. Tap to type`}
          onClick={() => {
            setDraft(shown)
            setEditing(true)
          }}
          className={`min-h-touch-comfortable min-w-0 flex-1 rounded-md text-center ${
            highlight ? 'border border-accent-border bg-accent-surface' : ''
          }`}
        >
          <span className="num text-3xl font-medium text-text">{shown}</span>
          {unit ? (
            <span className="ml-2 text-xs tracking-wider text-text-secondary uppercase">
              {unit}
            </span>
          ) : null}
        </button>
      )}

      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value + step)}
        className="num min-h-touch-comfortable min-w-touch-comfortable rounded-md border border-border bg-surface-raised text-xl text-text active:bg-surface"
      >
        +
      </button>
    </div>
  )
}
