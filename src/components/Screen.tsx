import type { ReactNode } from 'react'

/**
 * Page shell. Owns the scroll region and reserves the bottom third for the
 * primary action, per Part 7 — that band is where the thumb lands, and nothing
 * important goes in the top corners.
 *
 * Three details here are load-bearing on a real phone:
 *
 *  - Height is fixed to the viewport (`h-dvh`, not `min-h-dvh`) and the scroll
 *    region carries `min-h-0`. A flex child with `overflow-y-auto` and no
 *    `min-h-0` grows to fit its content instead of scrolling, which pushes the
 *    action button off the bottom of the screen.
 *  - Safe-area insets are applied *inside* this fixed height, so the notch and
 *    home indicator eat into the layout rather than making the document taller
 *    than the screen.
 *  - The scroll region contains its own overscroll, so rubber-banding at the
 *    top of the exercise list cannot trigger a pull-to-refresh mid-session.
 *
 * Every screen is built to *fit* this box rather than scroll inside it (owner
 * request: "I mainly want things I just tap and everything shows at once").
 * The one exception is the day plan's exercise list, which owns its own
 * internal scroller so the screen around it still never moves. The screenshot
 * audit fails any screen whose content overflows.
 */
export function Screen({
  children,
  action,
}: {
  children: ReactNode
  /** Rendered pinned to the bottom, above the home indicator. */
  action?: ReactNode
}) {
  return (
    <div
      className="flex h-dvh flex-col bg-bg"
      style={{
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
      }}
    >
      {/* A flex column, so a screen can hand a child `flex-1` to centre itself
          in whatever space is left over. */}
      <main
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-12 pb-8"
        style={{
          // Was safe-top + 48px. Halved: on a 667px phone that dead band at
          // the top was the difference between a screen that fits and one
          // that scrolls, and the safe inset already clears the notch.
          paddingTop: 'calc(var(--safe-top) + var(--spacing-6))',
          // With no action bar below it, the scroll region is what has to clear
          // the home indicator.
          paddingBottom: action
            ? undefined
            : 'calc(var(--safe-bottom) + var(--spacing-8))',
        }}
      >
        {children}
      </main>

      {action ? (
        <div
          data-screen-action
          className="relative shrink-0 bg-bg px-6 pt-2 pb-10"
          // safe-bottom is what actually clears the home indicator; the extra
          // was 40px of padding on top of that, now 24px.
          style={{ paddingBottom: 'calc(var(--safe-bottom) + var(--spacing-6))' }}
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
