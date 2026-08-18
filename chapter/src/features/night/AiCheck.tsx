import { useEffect, useRef, useState } from 'react'
import {
  RecorderError,
  browserDeps,
  createRecorder,
  isRecordingSupported,
  transcribe,
  type Recorder,
  type Recording,
} from '../../lib/speech'
import { suggestGrade, type GradeSuggestion } from '../../lib/aiGrade'
import type { Grade } from '../../lib/scheduler'

type Phase = 'idle' | 'recording' | 'thinking' | 'shown' | 'failed'

const LABEL: Record<Grade, string> = {
  got_it: 'Got it',
  partial: 'Partial',
  missed: 'Missed',
}

/**
 * Optional second opinion, offered only AFTER the reveal.
 *
 * The model advises; it never decides. Nothing here writes a grade — it hands
 * the user a suggestion they tap to accept, and the three manual buttons stay
 * on screen and stay authoritative the whole time. Every failure path is
 * silent: the suggestion simply does not appear and the night carries on.
 */
export function AiCheck({
  noteBody,
  onAccept,
}: {
  noteBody: string
  onAccept: (grade: Grade) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [suggestion, setSuggestion] = useState<GradeSuggestion | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const recorderRef = useRef<Recorder | null>(null)

  useEffect(() => () => recorderRef.current?.cancel(), [])

  if (!isRecordingSupported()) return null

  async function judge(recording: Recording) {
    setPhase('thinking')
    try {
      const attempt = await transcribe(recording)
      const result = await suggestGrade(noteBody, attempt)
      if (!result) {
        setPhase('failed')
        setMessage('No second opinion this time. Grade it yourself.')
        return
      }
      setSuggestion(result)
      setPhase('shown')
    } catch {
      setPhase('failed')
      setMessage('Could not check that. Grade it yourself.')
    }
  }

  async function start() {
    setMessage(null)
    const recorder = createRecorder(browserDeps(), (auto) => void judge(auto))
    recorderRef.current = recorder
    try {
      await recorder.start()
      setPhase('recording')
    } catch (e) {
      setPhase('failed')
      setMessage(
        e instanceof RecorderError && e.kind === 'denied'
          ? 'Microphone access is off. Grade it yourself.'
          : 'No microphone. Grade it yourself.',
      )
    }
  }

  async function stop() {
    const recorder = recorderRef.current
    if (!recorder) return
    try {
      await judge(await recorder.stop())
    } catch {
      setPhase('failed')
      setMessage('Nothing was captured. Grade it yourself.')
    }
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        onClick={start}
        className="w-full text-xs text-ink-faint underline underline-offset-4 py-2 min-h-11"
      >
        Say your version and have it checked
      </button>
    )
  }

  if (phase === 'recording') {
    return (
      <button
        type="button"
        onClick={stop}
        className="w-full min-h-11 rounded-[var(--radius-md)] border border-warn/50 text-warn text-sm"
      >
        Stop and check
      </button>
    )
  }

  if (phase === 'thinking') {
    return <p className="text-center text-sm text-ink-quiet py-3">Checking…</p>
  }

  if (phase === 'failed') {
    return <p className="text-center text-xs text-ink-faint py-2">{message}</p>
  }

  if (!suggestion) return null

  return (
    <div
      data-testid="ai-suggestion"
      className="rounded-[var(--radius-md)] border border-border-soft bg-surface p-3.5 text-sm leading-relaxed"
    >
      {suggestion.gotRight.length > 0 && (
        <p className="text-good">
          <span className="font-medium">Got:</span> {suggestion.gotRight.join(' ')}
        </p>
      )}
      {suggestion.missed.length > 0 && (
        <p className="text-warn mt-1.5">
          <span className="font-medium">Missed:</span> {suggestion.missed.join(' ')}
        </p>
      )}
      {suggestion.reason && <p className="text-ink-quiet mt-2">{suggestion.reason}</p>}
      <button
        type="button"
        onClick={() => onAccept(suggestion.suggestedGrade)}
        className="w-full min-h-11 mt-3 rounded-[var(--radius-md)] border border-accent text-accent-ink text-sm font-medium"
      >
        Use “{LABEL[suggestion.suggestedGrade]}”
      </button>
      <p className="text-xs text-ink-faint mt-2 text-center">
        A suggestion. The three buttons below are still yours.
      </p>
    </div>
  )
}
