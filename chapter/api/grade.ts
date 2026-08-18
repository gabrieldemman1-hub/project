/**
 * AI recall grading for Phase 4 Step B.
 *
 * The user recalls a note out loud, reveals it, then optionally sends their
 * attempt here. Claude returns what they got right, what they missed, and a
 * SUGGESTED grade. The model advises; the user decides. The grade written to
 * IndexedDB is always the one the user confirmed — this route cannot write
 * anything.
 *
 * ANTHROPIC_API_KEY is read from the environment and never reaches the client.
 */
import Anthropic from '@anthropic-ai/sdk'

export const config = { runtime: 'nodejs' }

const MAX_CHARS = 4000

const SCHEMA = {
  type: 'object',
  properties: {
    got_right: {
      type: 'array',
      items: { type: 'string' },
      description: 'Points from the note the attempt captured. Empty if none.',
    },
    missed: {
      type: 'array',
      items: { type: 'string' },
      description: 'Points from the note the attempt did not capture. Empty if none.',
    },
    suggested_grade: {
      type: 'string',
      enum: ['got_it', 'partial', 'missed'],
    },
    reason: {
      type: 'string',
      description: 'One short sentence explaining the suggested grade.',
    },
  },
  required: ['got_right', 'missed', 'suggested_grade', 'reason'],
  additionalProperties: false,
} as const

const SYSTEM = `You are grading a single spaced-repetition recall attempt for one person's private reading notes.

The note is what they wrote, in their own words, after reading a chapter. The attempt is what they just said from memory before seeing it again.

Grade the SUBSTANCE, not the wording. Different phrasing that carries the same idea is a hit. A confident statement of something the note does not say is a miss worth naming.

Use the grades this way:
- got_it: the central idea came back, even if details were fuzzy
- partial: some of it came back, with a real gap
- missed: the idea did not come back, or what came back was wrong

Be brief and concrete. Address the reader as "you". Never invent points that are not in the note.`

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'POST a note and an attempt.')
  if (!process.env['ANTHROPIC_API_KEY']) {
    return fail(503, 'AI grading is not configured on this deployment.')
  }

  let note = ''
  let attempt = ''
  try {
    const body: unknown = await req.json()
    if (typeof body === 'object' && body !== null) {
      note = String((body as { note?: unknown }).note ?? '').slice(0, MAX_CHARS)
      attempt = String((body as { attempt?: unknown }).attempt ?? '').slice(0, MAX_CHARS)
    }
  } catch {
    return fail(400, 'Could not read the request.')
  }
  if (!note.trim() || !attempt.trim()) return fail(400, 'Both the note and the attempt are required.')

  const client = new Anthropic()

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      system: SYSTEM,
      // Adaptive thinking with low effort: this is a short, well-specified
      // comparison, not a research task.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `THE NOTE THEY WROTE:\n${note}\n\nWHAT THEY JUST RECALLED:\n${attempt}`,
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return fail(502, 'The model declined to grade that. Grade it yourself.')
    }

    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return fail(502, 'No grading came back.')

    // The schema constrains the shape, but this route must never hand the
    // client something it cannot parse.
    const parsed: unknown = JSON.parse(text.text)
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail(429, 'Rate limited. Try again shortly.')
    if (error instanceof Anthropic.AuthenticationError) return fail(503, 'The API key on this deployment is not valid.')
    if (error instanceof Anthropic.APIError) return fail(502, `The grader returned an error (${error.status}).`)
    return fail(502, 'Could not reach the grader.')
  }
}
