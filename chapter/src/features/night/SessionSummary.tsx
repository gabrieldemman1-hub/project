import { Button } from '../../components/Button'
import { hrefFor } from '../../lib/router'

export function SessionSummary({
  graded,
  heldBack,
  reviewStreak,
  onDone,
}: {
  graded: number
  heldBack: number
  reviewStreak: number
  onDone: () => void
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="session-summary"
      className="fixed inset-0 z-50 flex items-center justify-center px-8"
      style={{ background: 'var(--overlay)' }}
    >
      <div className="w-full max-w-sm bg-surface rounded-[var(--radius-lg)] p-7 text-center border border-border-soft">
        <p className="text-lg font-medium">Recall done</p>
        <p className="text-5xl font-semibold tnum text-accent-ink mt-4">{reviewStreak}</p>
        <p className="text-sm text-ink-quiet mt-1">
          {reviewStreak === 1 ? 'night' : 'nights'} in a row
        </p>
        <p className="text-sm text-ink-quiet mt-5 leading-relaxed">
          {graded} {graded === 1 ? 'note' : 'notes'} recalled.
          {heldBack > 0 && ` ${heldBack} more keep until tomorrow.`}
        </p>
        <a href={hrefFor({ name: 'home' })} className="block mt-6">
          <Button full onClick={onDone}>
            Goodnight
          </Button>
        </a>
      </div>
    </div>
  )
}
