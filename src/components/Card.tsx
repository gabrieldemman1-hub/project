import type { ReactNode } from 'react'

/**
 * A layered surface, a touch lighter than the page. Quiet by default — the glow
 * is reserved for at most two elements per screen (Part 7), so cards never
 * carry one.
 */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface ${className}`.trim()}
    >
      {children}
    </div>
  )
}
