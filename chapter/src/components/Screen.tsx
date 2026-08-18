import type { ReactNode } from 'react'

interface Props {
  title?: string
  /** Rendered top-right — never a primary action, per the layout rule. */
  action?: ReactNode
  back?: { label: string; href: string }
  children: ReactNode
  /** Sticks to the bottom third, where a thumb is. */
  footer?: ReactNode
  /**
   * Set false on any screen with a big text input. iOS shrinks the visual
   * viewport for the keyboard but not the layout viewport, so a stuck footer
   * ends up hidden behind the keyboard with no way to reach it.
   */
  stickyFooter?: boolean
}

export function Screen({ title, action, back, children, footer, stickyFooter = true }: Props) {
  return (
    <div className="min-h-full flex flex-col bg-ground text-ink">
      <header className="safe-top px-5 pb-2">
        {back && (
          <a
            href={back.href}
            className="inline-flex items-center gap-1 -ml-1 min-h-11 text-sm text-ink-quiet"
          >
            <span aria-hidden="true">‹</span> {back.label}
          </a>
        )}
        {(title || action) && (
          <div className="flex items-baseline justify-between gap-3 mt-1">
            {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
            {action}
          </div>
        )}
      </header>

      <main className="flex-1 px-5 pb-6">{children}</main>

      {footer && (
        <footer
          className={`safe-bottom px-5 pt-3 ${
            stickyFooter ? 'sticky bottom-0 bg-ground/95 backdrop-blur-sm' : ''
          }`}
        >
          {footer}
        </footer>
      )}
    </div>
  )
}
