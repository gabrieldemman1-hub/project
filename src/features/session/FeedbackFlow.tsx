import { useState } from 'react'

import { QuestionScreen } from './QuestionScreen'
import type { ExerciseFeedbackInput } from '../../db/mutations'
import type { Pump, Rir } from '../../db/schema'

/**
 * The after-the-last-set questions for one exercise (BRIEF Part 5): pump,
 * reps left in the tank, and the dismissible joint-pain check. Three taps on
 * a good day, and the answers drive next session's prescription.
 */
export function FeedbackFlow({
  exerciseName,
  onComplete,
}: {
  exerciseName: string
  onComplete: (feedback: ExerciseFeedbackInput) => void
}) {
  const [pump, setPump] = useState<Pump | null>(null)
  const [rir, setRir] = useState<Rir | null>(null)

  if (pump === null) {
    return (
      <QuestionScreen<Pump>
        step={`${exerciseName} · 1 of 3`}
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
