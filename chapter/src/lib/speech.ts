/**
 * Voice capture — Phase 4 Step A.
 *
 * Typing is never replaced. This is a second door into the same field, and
 * every failure path lands the user back at a textarea they can type into
 * rather than at a dead end.
 *
 * The browser APIs are injected so every path — permission denied, no support,
 * the three-minute cutoff, a failed upload — is testable without a browser.
 *
 * Note: the iOS keyboard's own dictation mic still works in the same field and
 * needs none of this. This route exists for longer, hands-free capture where a
 * server transcription is better than on-device dictation.
 */
export type RecorderFailure = 'unsupported' | 'denied' | 'no-input' | 'failed'

export class RecorderError extends Error {
  constructor(
    readonly kind: RecorderFailure,
    message: string,
  ) {
    super(message)
  }
}

export interface Recording {
  blob: Blob
  mimeType: string
  durationMs: number
  /** True when the three-minute cutoff stopped it rather than the user. */
  autoStopped: boolean
}

/** Three minutes, per the brief. Long enough for a chapter's worth of thought. */
export const MAX_RECORDING_MS = 180_000

export interface RecorderDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  createRecorder: (stream: MediaStream, mimeType: string | undefined) => MediaRecorder
  pickMimeType: () => string | undefined
  now: () => number
  setTimer: (fn: () => void, ms: number) => number
  clearTimer: (id: number) => void
}

/**
 * iOS Safari produces audio/mp4, Chrome produces audio/webm. Asking for the
 * wrong one throws, so probe rather than assume.
 */
function defaultMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const type of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported?.(type)) return type
  }
  return undefined
}

export function browserDeps(): RecorderDeps {
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    createRecorder: (stream, mimeType) =>
      new MediaRecorder(stream, mimeType ? { mimeType } : undefined),
    pickMimeType: defaultMimeType,
    now: () => Date.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
  }
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

export interface Recorder {
  start(): Promise<void>
  stop(): Promise<Recording>
  cancel(): void
  readonly recording: boolean
}

export function createRecorder(
  deps: RecorderDeps,
  onAutoStop?: (recording: Recording) => void,
): Recorder {
  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: Blob[] = []
  let startedAt = 0
  let timer: number | null = null
  let autoStopped = false
  let settle: ((r: Recording) => void) | null = null

  function releaseStream() {
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
  }

  function clearCutoff() {
    if (timer !== null) {
      deps.clearTimer(timer)
      timer = null
    }
  }

  function assemble(): Recording {
    const mimeType = recorder?.mimeType || chunks[0]?.type || 'audio/webm'
    return {
      blob: new Blob(chunks, { type: mimeType }),
      mimeType,
      durationMs: deps.now() - startedAt,
      autoStopped,
    }
  }

  return {
    get recording() {
      return recorder !== null
    },

    async start() {
      if (recorder) return
      chunks = []
      autoStopped = false

      try {
        stream = await deps.getUserMedia({ audio: true })
      } catch (e) {
        // NotAllowedError is a refusal; everything else is a broken mic.
        const name = e instanceof Error ? e.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new RecorderError('denied', 'Microphone access was refused.')
        }
        throw new RecorderError('no-input', 'No microphone was available.')
      }

      try {
        recorder = deps.createRecorder(stream, deps.pickMimeType())
      } catch {
        releaseStream()
        throw new RecorderError('unsupported', 'This browser cannot record audio.')
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        clearCutoff()
        releaseStream()
        const result = assemble()
        recorder = null
        const resolve = settle
        settle = null
        if (resolve) resolve(result)
        else if (autoStopped) onAutoStop?.(result)
      }

      startedAt = deps.now()
      recorder.start()

      // Three minutes, then stop and keep what we have. Never discard it.
      timer = deps.setTimer(() => {
        autoStopped = true
        if (recorder && recorder.state !== 'inactive') recorder.stop()
      }, MAX_RECORDING_MS)
    },

    stop() {
      return new Promise<Recording>((resolve, reject) => {
        if (!recorder) {
          reject(new RecorderError('failed', 'Nothing was recording.'))
          return
        }
        settle = resolve
        clearCutoff()
        if (recorder.state === 'inactive') {
          const result = assemble()
          recorder = null
          settle = null
          releaseStream()
          resolve(result)
        } else {
          recorder.stop()
        }
      })
    },

    cancel() {
      clearCutoff()
      settle = null
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      recorder = null
      chunks = []
      releaseStream()
    },
  }
}

export class TranscribeError extends Error {}

/**
 * Sends a recording for transcription. The caller keeps the blob — this
 * function never owns the only copy, so a failure here can always be retried
 * without asking the user to speak again.
 */
export async function transcribe(
  recording: Recording,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const extension = recording.mimeType.includes('mp4') ? 'm4a' : 'webm'
  const form = new FormData()
  form.append('audio', recording.blob, `note.${extension}`)

  let res: Response
  try {
    res = await fetchImpl('/api/transcribe', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(90_000),
    })
  } catch {
    throw new TranscribeError('Could not reach the transcriber. Your recording is still here.')
  }

  if (!res.ok) {
    let detail = ''
    try {
      const payload: unknown = await res.json()
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        detail = String((payload as { error: unknown }).error)
      }
    } catch {
      /* the body was not JSON */
    }
    throw new TranscribeError(detail || `Transcription failed (${res.status}).`)
  }

  try {
    const payload: unknown = await res.json()
    const text =
      typeof payload === 'object' && payload !== null && 'text' in payload
        ? String((payload as { text: unknown }).text ?? '')
        : ''
    if (!text.trim()) throw new TranscribeError('Nothing came back from the transcriber.')
    return text.trim()
  } catch (e) {
    if (e instanceof TranscribeError) throw e
    throw new TranscribeError('The transcriber sent something unreadable.')
  }
}
