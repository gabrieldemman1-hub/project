import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RECORDING_MS,
  RecorderError,
  TranscribeError,
  createRecorder,
  transcribe,
  type RecorderDeps,
} from './speech'

/** A MediaRecorder stand-in, so every path is testable without a browser. */
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(readonly mimeType: string) {}
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

function harness(overrides: Partial<RecorderDeps> = {}) {
  const stopped: string[] = []
  const stream = {
    getTracks: () => [{ stop: () => stopped.push('track') }],
  } as unknown as MediaStream

  let fired: (() => void) | null = null
  let clock = 1000

  const deps: RecorderDeps = {
    getUserMedia: async () => stream,
    createRecorder: (_s, mimeType) => new FakeRecorder(mimeType ?? 'audio/webm') as unknown as MediaRecorder,
    pickMimeType: () => 'audio/webm',
    now: () => clock,
    setTimer: (fn) => {
      fired = fn
      return 1
    },
    clearTimer: () => {
      fired = null
    },
    ...overrides,
  }

  return {
    deps,
    stopped,
    advance: (ms: number) => (clock += ms),
    fireCutoff: () => fired?.(),
    get cutoffArmed() {
      return fired !== null
    },
  }
}

describe('recording', () => {
  it('captures audio and reports how long it ran', async () => {
    const h = harness()
    const rec = createRecorder(h.deps)
    await rec.start()
    expect(rec.recording).toBe(true)
    h.advance(4200)
    const result = await rec.stop()
    expect(result.blob.size).toBeGreaterThan(0)
    expect(result.durationMs).toBe(4200)
    expect(result.autoStopped).toBe(false)
    expect(rec.recording).toBe(false)
  })

  it('releases the microphone when it stops', async () => {
    const h = harness()
    const rec = createRecorder(h.deps)
    await rec.start()
    await rec.stop()
    expect(h.stopped).toContain('track')
  })

  it('releases the microphone when cancelled', async () => {
    const h = harness()
    const rec = createRecorder(h.deps)
    await rec.start()
    rec.cancel()
    expect(h.stopped).toContain('track')
    expect(rec.recording).toBe(false)
  })

  it('stops at three minutes and KEEPS what it has', async () => {
    const h = harness()
    const captured: Array<{ autoStopped: boolean; size: number }> = []
    const rec = createRecorder(h.deps, (r) => captured.push({ autoStopped: r.autoStopped, size: r.blob.size }))
    await rec.start()
    expect(h.cutoffArmed).toBe(true)
    h.advance(MAX_RECORDING_MS)
    h.fireCutoff()
    expect(captured).toHaveLength(1)
    expect(captured[0]!.autoStopped).toBe(true)
    expect(captured[0]!.size).toBeGreaterThan(0)
  })

  it('disarms the cutoff when the user stops first', async () => {
    const h = harness()
    const rec = createRecorder(h.deps)
    await rec.start()
    await rec.stop()
    expect(h.cutoffArmed).toBe(false)
  })

  it('reports a refused microphone as refused, not as a crash', async () => {
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' })
    const h = harness({ getUserMedia: async () => Promise.reject(denied) })
    const rec = createRecorder(h.deps)
    await expect(rec.start()).rejects.toBeInstanceOf(RecorderError)
    await rec.start().catch((e: RecorderError) => expect(e.kind).toBe('denied'))
    expect(rec.recording).toBe(false)
  })

  it('distinguishes a missing microphone from a refused one', async () => {
    const missing = Object.assign(new Error('none'), { name: 'NotFoundError' })
    const h = harness({ getUserMedia: async () => Promise.reject(missing) })
    const rec = createRecorder(h.deps)
    await rec.start().catch((e: RecorderError) => expect(e.kind).toBe('no-input'))
  })

  it('reports an unsupported recorder and lets go of the microphone', async () => {
    const h = harness({
      createRecorder: () => {
        throw new Error('nope')
      },
    })
    const rec = createRecorder(h.deps)
    await rec.start().catch((e: RecorderError) => expect(e.kind).toBe('unsupported'))
    expect(h.stopped).toContain('track')
  })

  it('refuses to stop when nothing is recording', async () => {
    const h = harness()
    const rec = createRecorder(h.deps)
    await expect(rec.stop()).rejects.toBeInstanceOf(RecorderError)
  })

  it('starting twice does not open a second microphone', async () => {
    const h = harness()
    const rec = createRecorder(h.deps)
    await rec.start()
    await rec.start()
    await rec.stop()
    expect(h.stopped.filter((s) => s === 'track')).toHaveLength(1)
  })
})

describe('transcribe — the recording is never the thing that gets lost', () => {
  const recording = {
    blob: new Blob(['bytes'], { type: 'audio/webm' }),
    mimeType: 'audio/webm',
    durationMs: 5000,
    autoStopped: false,
  }

  it('returns the transcript', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ text: '  the idea  ' }), { status: 200 }))
    expect(await transcribe(recording, f as unknown as typeof fetch)).toBe('the idea')
  })

  it('names the file by its real container so the server can read it', async () => {
    let sentName = ''
    const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as FormData
      const file = body.get('audio')
      if (file instanceof File) sentName = file.name
      return new Response(JSON.stringify({ text: 'x' }), { status: 200 })
    })
    await transcribe({ ...recording, mimeType: 'audio/mp4' }, f as unknown as typeof fetch)
    expect(sentName).toBe('note.m4a')
  })

  it('surfaces the server’s reason when it fails', async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'That recording is too long to transcribe.' }), { status: 413 }),
    )
    await expect(transcribe(recording, f as unknown as typeof fetch)).rejects.toThrow(/too long/)
  })

  it('says the recording is still here when the network dies', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(transcribe(recording, f as unknown as typeof fetch)).rejects.toThrow(/still here/)
  })

  it('handles a non-JSON error body', async () => {
    const f = vi.fn(async () => new Response('<html>502</html>', { status: 502 }))
    await expect(transcribe(recording, f as unknown as typeof fetch)).rejects.toBeInstanceOf(TranscribeError)
  })

  it('rejects an empty transcript rather than wiping the note field with nothing', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ text: '   ' }), { status: 200 }))
    await expect(transcribe(recording, f as unknown as typeof fetch)).rejects.toThrow(/Nothing came back/)
  })
})
