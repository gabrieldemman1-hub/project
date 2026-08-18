import type { InputHTMLAttributes, ReactNode } from 'react'

/**
 * A labelled single control — one input or one textarea.
 *
 * The <label> wrapper is only safe when there is exactly ONE labelable control
 * inside it. A <label> forwards clicks to its first labelable descendant, so
 * wrapping a stepper (three buttons) means every tap anywhere in the field
 * fires the "−" button. Use FieldGroup for anything with more than one control.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm text-ink-quiet mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-faint mt-1.5">{hint}</span>}
    </label>
  )
}

/**
 * A labelled group of controls — steppers, segmented toggles, pickers.
 * Deliberately NOT a <label>: see the note above. The group carries the name
 * instead, and each control inside carries its own.
 */
export function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="block text-sm text-ink-quiet mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-faint mt-1.5">{hint}</span>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-h-11 px-3.5 rounded-[var(--radius-md)] bg-surface border border-border-soft
        text-ink placeholder:text-ink-faint ${props.className ?? ''}`}
    />
  )
}
