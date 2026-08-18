import { useEffect, useRef, useState } from 'react'
import {
  MAX_RECORDING_MS,
  RecorderError,
  browserDeps,
  createRecorder,
  isRecordingSupported,
  transcribe,
  type Recorder,
  type Recording,
} from '../../lib/speech'

type Phase = 'idle' | 'recording' | 'sending' | 'error'

/**
 * The second door into the note field. Typing is always the first.
 *
 * Two rules shape this component:
 *   1. Transcribed text is APPENDED to whatever is already in the field, never
 *      substituted for it. Nothing you typed is ever overwritten by a machine.
 *   2. A failed transcription keeps the recording. The retry button re-sends the
 *      same audio — you are never asked to say it again because a request timed
 *      out.
 */
export function VoiceCapture({ onText }: { onText: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const recorderRef = useRef<Recorder | null>(null)
  const heldRef = useRef<Recording | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current)
      recorderRef.current?.cancel()
    },
    [],
  )

  if (!isRecordingSupported()) return null

  function stopTicking() {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  async function send(recording: Recording) {
    heldRef.current = recording
    setPhase('sending')
    setMessage(null)
    try {
      const text = await transcribe(recording)
      onText(text)
      heldRef.current = null
      setPhase('idle')
      setMessage(null)
    } catch (e) {
      // The audio is still in heldRef. Retry re-sends it.
      setPhase('error')
      setMessage(e instanceof Error ? e.message : 'That did not go through.')
    }
  }

  async function start() {
    setMessage(null)
    const recorder = createRecorder(browserDeps(), (auto) => {
      stopTicking()
      void send(auto)
    })
    recorderRef.current = recorder
    try {
      await recorder.start()
    } catch (e) {
      const kind = e instanceof RecorderError ? e.kind : 'failed'
      setPhase('idle')
      setMessage(
        kind === 'denied'
          ? 'Microphone access is off for this app. Type the note instead, or turn it on in Settings › Chapter.'
          : kind === 'no-input'
            ? 'No microphone found. Type the note instead.'
            : 'This browser will not record. Type the note instead.',
      )
      return
    }
    setElapsed(0)
    setPhase('recording')
    const startedAt = Date.now()
    tickRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 250)
  }

  async function stop() {
    stopTicking()
    const recorder = recorderRef.current
    if (!recorder) return
    try {
      await send(await recorder.stop())
    } catch {
      setPhase('idle')
      setMessage('Nothing was captured. Try again, or type it.')
    }
  }

  const seconds = Math.floor(elapsed / 1000)
  const remaining = Math.max(0, Math.ceil((MAX_RECORDING_MS - elapsed) / 1000))

  return (
    <div className="mt-2">
      {phase === 'recording' ? (
        <button
          type="button"
          onClick={stop}
          className="w-full min-h-11 rounded-[var(--radius-md)] border border-warn/50 text-warn text-sm tnum"
        >
          Stop and transcribe · {String(Math.floor(seconds / 60)).padStart(2, '0')}:
          {String(seconds % 60).padStart(2, '0')}
          {remaining <= 30 ? ` · ${remaining}s left` : ''}
        </button>
      ) : phase === 'sending' ? (
        <p className="text-sm text-ink-quiet text-center py-3">Transcribing…</p>
      ) : phase === 'error' ? (
        <div>
          <p className="text-sm text-warn leading-relaxed">{message}</p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => heldRef.current && void send(heldRef.current)}
              className="flex-1 min-h-11 rounded-[var(--radius-md)] border border-border-soft text-sm"
            >
              Try that recording again
            </button>
            <button
              type="button"
              onClick={() => {
                heldRef.current = null
                setPhase('idle')
                setMessage(null)
              }}
              className="flex-1 min-h-11 rounded-[var(--radius-md)] border border-border-soft text-sm text-ink-quiet"
            >
              Discard it
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={start}
            className="w-full min-h-11 rounded-[var(--radius-md)] border border-border-soft text-sm text-ink-quiet"
          >
            Speak it instead
          </button>
          {message && <p className="text-sm text-warn mt-2 leading-relaxed">{message}</p>}
        </>
      )}
    </div>
  )
}
