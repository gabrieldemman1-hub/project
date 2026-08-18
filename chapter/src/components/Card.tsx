import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  as = 'div',
  href,
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'a'
  href?: string
}) {
  const cls = `bg-surface border border-border-soft rounded-[var(--radius-lg)] ${className}`
  if (as === 'a' && href) {
    return (
      <a href={href} className={`${cls} block`}>
        {children}
      </a>
    )
  }
  return <div className={cls}>{children}</div>
}
