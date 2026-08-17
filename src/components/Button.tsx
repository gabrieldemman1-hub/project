import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'quiet'

/**
 * `primary` is the glowing one — the light reads as coming from the element
 * itself. Part 7 allows at most two glowing things per screen, so a screen
 * should carry exactly one primary button.
 *
 * Every variant clears the 44px touch-target floor; the primary sits well above
 * it because it is used one-handed, standing, between sets.
 */
export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: {
  children: ReactNode
  variant?: Variant
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'w-full rounded-xl font-medium tracking-wide transition-[transform,box-shadow,background-color,color] active:scale-[0.99] disabled:active:scale-100'

  // A disabled primary keeps its shape and a trace of the glow rather than
  // fading to a grey slab — it should read as "not yet", not as broken.
  const variants: Record<Variant, string> = {
    primary: [
      'min-h-control text-lg',
      'bg-accent text-on-accent shadow-strong',
      // Dimmed but still unmistakably the hero — an invisible primary action is
      // worse than a visibly inactive one.
      'disabled:opacity-55 disabled:shadow-soft',
    ].join(' '),
    quiet: [
      'min-h-touch-comfortable text-base',
      'border border-border bg-surface-raised text-text',
      'hover:border-border-strong disabled:text-text-muted',
    ].join(' '),
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`.trim()}
      style={{ transitionDuration: 'var(--duration-fast)' }}
      {...props}
    >
      {children}
    </button>
  )
}
