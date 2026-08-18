/**
 * Speech-to-text for Phase 4 Step A.
 *
 * Deliberately provider-neutral. Anthropic has no speech-to-text API, and this
 * app should not be married to whichever vendor is cheapest this year, so the
 * route proxies to any OpenAI-compatible /audio/transcriptions endpoint —
 * OpenAI, Groq, or a local whisper server all speak it. Configure:
 *
 *   TRANSCRIBE_URL    e.g. https://api.groq.com/openai/v1/audio/transcriptions
 *   TRANSCRIBE_KEY    the bearer token
 *   TRANSCRIBE_MODEL  optional, defaults to whisper-1
 *
 * The key never leaves the server. The client posts audio and gets text.
 */
export const config = { runtime: 'nodejs' }

const MAX_BYTES = 25 * 1024 * 1024 // the usual limit on these endpoints

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'POST an audio file.')

  const url = process.env['TRANSCRIBE_URL']
  const key = process.env['TRANSCRIBE_KEY']
  if (!url || !key) return fail(503, 'Transcription is not configured on this deployment.')

  let audio: File | null = null
  try {
    const form = await req.formData()
    const file = form.get('audio')
    if (file instanceof File) audio = file
  } catch {
    return fail(400, 'Could not read the upload.')
  }
  if (!audio) return fail(400, 'No audio in the request.')
  if (audio.size === 0) return fail(400, 'The recording was empty.')
  if (audio.size > MAX_BYTES) return fail(413, 'That recording is too long to transcribe.')

  const upstream = new FormData()
  upstream.append('file', audio, audio.name || 'note.webm')
  upstream.append('model', process.env['TRANSCRIBE_MODEL'] ?? 'whisper-1')
  upstream.append('response_format', 'json')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: upstream,
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      // Never forward the upstream body — it can echo request headers.
      return fail(502, `Transcription failed (${res.status}).`)
    }
    const payload: unknown = await res.json()
    const text =
      typeof payload === 'object' && payload !== null && 'text' in payload
        ? String((payload as { text: unknown }).text ?? '')
        : ''
    if (!text.trim()) return fail(502, 'Nothing came back from the transcriber.')
    return new Response(JSON.stringify({ text: text.trim() }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return fail(504, 'The transcriber did not answer in time.')
  }
}
