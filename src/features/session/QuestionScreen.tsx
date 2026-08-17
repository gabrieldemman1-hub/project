import type { ReactNode } from 'react'

import { Screen } from '../../components/Screen'

export interface QuestionOption<T extends string> {
  value: T
  label: string
  /** Muted red treatment — reserved for "still sore" and joint pain (Part 7). */
  alert?: boolean
}

/**
 * One full-screen question with big tap targets (BRIEF Part 6). This is the
 * thing most likely to get skipped, so it must take under five seconds: the
 * options sit in the thumb's half of the screen, one tap answers and advances,
 * and an optional skip needs no precision.
 */
export function QuestionScreen<T extends string>({
  step,
  question,
  options,
  onAnswer,
  onSkip,
  skipLabel = 'Skip',
}: {
  /** e.g. "Feedback · 2 of 3" */
  step: string
  question: ReactNode
  options: ReadonlyArray<QuestionOption<T>>
  onAnswer: (value: T) => void
  onSkip?: (() => void) | undefined
  skipLabel?: string
}) {
  return (
    <Screen>
      <p className="text-xs tracking-wider text-text-secondary uppercase">{step}</p>

      {/* The question sits directly above the answers rather than at the top
          of the screen (Phase 8): between sets this is read at arm's length
          in one glance, and a question separated from its answers by half a
          screen of black made the eye travel for nothing. The step label
          stays up top for orientation; everything that must be read and
          tapped lives together in the thumb's half. */}
      <h1 className="mt-auto max-w-measure-tight text-2xl leading-snug text-balance text-text">
        {question}
      </h1>

      <div className="mt-10 flex flex-col gap-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onAnswer(option.value)}
            className={
              option.alert
                ? 'min-h-control rounded-xl border border-alert bg-alert-surface text-lg text-alert'
                : 'min-h-control rounded-xl border border-border bg-surface-raised text-lg text-text active:bg-surface'
            }
          >
            {option.label}
          </button>
        ))}
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="min-h-touch-min rounded-md text-xs tracking-wider text-text-muted uppercase"
          >
            {skipLabel}
          </button>
        ) : null}
      </div>
    </Screen>
  )
}
