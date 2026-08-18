interface Props {
  percent: number
  /** Animates the fill and counts the number up — the morning celebration. */
  celebrate?: boolean
  label?: string
}

export function ProgressBar({ percent, celebrate = false, label }: Props) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="w-full">
      <div
        className="h-1.5 w-full rounded-full bg-surface-sunk overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Reading progress'}
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{
            width: `${clamped}%`,
            transition: celebrate ? 'width 600ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'width 200ms',
          }}
        />
      </div>
    </div>
  )
}
