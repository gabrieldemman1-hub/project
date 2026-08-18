import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
  children: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-5 min-h-11 ' +
  'font-medium tracking-tight transition-colors disabled:opacity-40 disabled:pointer-events-none'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent py-3.5 text-base shadow-sm',
  secondary: 'bg-surface text-ink border border-border-soft py-3',
  quiet: 'bg-transparent text-ink-quiet py-2 px-3',
  danger: 'bg-transparent text-warn border border-warn/40 py-3',
}

export function Button({ variant = 'primary', full, className = '', children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`${BASE} ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

/** Same shape, but a link — used where navigation is the action. */
export function LinkButton({
  href,
  variant = 'primary',
  full,
  children,
}: {
  href: string
  variant?: Variant
  full?: boolean
  children: ReactNode
}) {
  return (
    <a href={href} className={`${BASE} ${VARIANTS[variant]} ${full ? 'w-full' : ''}`}>
      {children}
    </a>
  )
}
