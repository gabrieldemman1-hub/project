import type { ReactNode } from 'react'

/**
 * Page shell. Owns the scroll region and reserves the bottom third for the
 * primary action, per Part 7 — that band is where the thumb lands, and nothing
 * important goes in the top corners.
 *
 * The height is fixed to the viewport (`h-dvh`, not `min-h-dvh`) and the scroll
 * region carries `min-h-0`. Both are load-bearing: a flex child with
 * `overflow-y-auto` and no `min-h-0` grows to fit its content instead of
 * scrolling, which pushes the action button off the bottom of the screen.
 */
export function Screen({
  children,
  action,
}: {
  children: ReactNode
  /** Rendered pinned to the bottom, above the safe-area inset. */
  action?: ReactNode
}) {
  return (
    <div className="flex h-dvh flex-col bg-bg">
      {/* A flex column, so a screen can hand a child `flex-1` to centre itself
          in whatever space is left over. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-12 pb-8">
        {children}
      </main>
      {action ? (
        <div
          data-screen-action
          className="relative shrink-0 bg-bg px-6 pt-2 pb-10"
        >
          {/* Fades the scrolling content into the action bar instead of
              cutting it off mid-card, and doubles as the hint that there is
              more below. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-linear-to-t from-bg to-transparent"
          />
          {action}
        </div>
      ) : null}
    </div>
  )
}
