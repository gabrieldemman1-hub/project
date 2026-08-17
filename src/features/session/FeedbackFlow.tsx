import { useState } from 'react'

import { QuestionScreen } from './QuestionScreen'
import type { ExerciseFeedbackInput } from '../../db/mutations'
import type { LoggedSet, Pump, Rir } from '../../db/schema'

/**
 * The after-the-last-set questions for one exercise (BRIEF Part 5): pump,
 * reps left in the tank, and the dismissible joint-pain check. Three taps on
 * a good day, and the answers drive next session's prescription.
 *
 * Every question carries the sets just logged. The answers are judgements
 * about that work, and they are better ones with the work in front of you —
 * "2 reps left in the tank" means something different after 185 × 10 than
 * after 185 × 6.
 */
export function FeedbackFlow({
  exerciseName,
  sets,
  onComplete,
}: {
  exerciseName: string
  /** The sets logged for this exercise this session, in order. */
  sets: LoggedSet[]
  onComplete: (feedback: ExerciseFeedbackInput) => void
}) {
  const [pump, setPump] = useState<Pump | null>(null)
  const [rir, setRir] = useState<Rir | null>(null)

  const context = <SetsJustDone sets={sets} />

  if (pump === null) {
    return (
      <QuestionScreen<Pump>
        step={`${exerciseName} · 1 of 3`}
        context={context}
        question="How was the pump?"
        options={[
          { value: 'low', label: 'Low' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'great', label: 'Great' },
        ]}
        onAnswer={setPump}
      />
    )
  }

  if (rir === null) {
    return (
      <QuestionScreen<Rir>
        step={`${exerciseName} · 2 of 3`}
        // The RIR question is about the last set specifically, so that row is
        // the one marked.
        context={<SetsJustDone sets={sets} markLast />}
        question="Reps left in the tank on that last set?"
        options={[
          { value: '3+', label: '3 or more' },
          { value: '2', label: '2' },
          { value: '1', label: '1' },
          { value: '0', label: 'Nothing left' },
        ]}
        onAnswer={setRir}
      />
    )
  }

  return (
    <QuestionScreen<'no' | 'yes'>
      step={`${exerciseName} · 3 of 3`}
      context={context}
      question="Any joint pain?"
      options={[
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes', alert: true },
      ]}
      onAnswer={(value) => onComplete({ pump, rir, jointPain: value === 'yes' })}
      onSkip={() => onComplete({ pump, rir, jointPain: null })}
    />
  )
}

/** The just-finished sets, weight × reps, in the numeric face. */
function SetsJustDone({
  sets,
  markLast = false,
}: {
  sets: LoggedSet[]
  markLast?: boolean
}) {
  if (sets.length === 0) return null
  return (
    <div>
      <p className="text-micro tracking-wider text-text-muted uppercase">
        {markLast ? 'That last set' : 'Just logged'}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {sets.map((set, index) => {
          const isLast = index === sets.length - 1
          const dim = markLast && !isLast
          return (
            <li
              key={set.id}
              className={`flex items-center gap-4 rounded-md border px-4 py-2 ${
                markLast && isLast
                  ? 'border-accent-border bg-accent-surface'
                  : 'border-border bg-surface'
              }`}
            >
              <span className="num w-5 shrink-0 text-sm text-text-muted">
                {index + 1}
              </span>
              <span
                className={`num flex-1 text-right text-base ${
                  dim ? 'text-text-muted' : 'text-text'
                }`}
              >
                {set.weightLb} × {set.reps}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
