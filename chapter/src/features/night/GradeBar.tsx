import type { Grade } from '../../lib/scheduler'

const OPTIONS: Array<{ grade: Grade; label: string; className: string }> = [
  { grade: 'missed', label: 'Missed', className: 'text-warn border-warn/40' },
  { grade: 'partial', label: 'Partial', className: 'text-ink border-border-soft' },
  { grade: 'got_it', label: 'Got it', className: 'text-good border-good/40' },
]

/**
 * Only ever mounted after the reveal. Grading a note you never tried to recall
 * would be a lie to the scheduler, so the control does not exist until the
 * attempt has been made.
 */
export function GradeBar({ onGrade, busy }: { onGrade: (g: Grade) => void; busy: boolean }) {
  return (
    <div className="flex gap-2" data-testid="grade-bar">
      {OPTIONS.map((o) => (
        <button
          key={o.grade}
          type="button"
          disabled={busy}
          onClick={() => onGrade(o.grade)}
          className={`flex-1 min-h-[3.75rem] rounded-[var(--radius-md)] bg-surface border
            font-medium disabled:opacity-40 ${o.className}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
