import { describe, expect, it, vi } from 'vitest'
import { parseSuggestion, suggestGrade } from './aiGrade'

const good = {
  got_right: ['You remembered that rewriting is the encoding step.'],
  missed: ['You did not mention that reviews happen at night on purpose.'],
  suggested_grade: 'partial',
  reason: 'The central idea came back with a real gap.',
}

describe('parseSuggestion', () => {
  it('accepts a well-formed suggestion', () => {
    const s = parseSuggestion(good)
    expect(s?.suggestedGrade).toBe('partial')
    expect(s?.gotRight).toHaveLength(1)
    expect(s?.missed).toHaveLength(1)
  })

  it('rejects a grade the scheduler does not understand', () => {
    expect(parseSuggestion({ ...good, suggested_grade: 'excellent' })).toBeNull()
    expect(parseSuggestion({ ...good, suggested_grade: 5 })).toBeNull()
  })

  it('rejects a suggestion with nothing in it — silence beats a fake opinion', () => {
    expect(parseSuggestion({ got_right: [], missed: [], suggested_grade: 'got_it', reason: '  ' })).toBeNull()
  })

  it('accepts a suggestion carried by its reason alone', () => {
    const s = parseSuggestion({ got_right: [], missed: [], suggested_grade: 'got_it', reason: 'You had it.' })
    expect(s?.suggestedGrade).toBe('got_it')
  })

  it('drops junk entries out of the lists', () => {
    const s = parseSuggestion({ ...good, got_right: ['real', '', 42, null, '  '] })
    expect(s?.gotRight).toEqual(['real'])
  })

  it('survives every malformed shape', () => {
    for (const junk of [null, undefined, 42, 'text', [], {}, { got_right: 'no' }]) {
      expect(parseSuggestion(junk)).toBeNull()
    }
  })
})

describe('suggestGrade — a failure always falls back to grading it yourself', () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('returns the suggestion on success', async () => {
    expect((await suggestGrade('note', 'attempt', ok(good)))?.suggestedGrade).toBe('partial')
  })

  it('returns null when the route is not deployed', async () => {
    expect(await suggestGrade('note', 'attempt', ok({ error: 'not configured' }, 503))).toBeNull()
  })

  it('returns null when the model is rate limited', async () => {
    expect(await suggestGrade('note', 'attempt', ok({ error: 'slow down' }, 429))).toBeNull()
  })

  it('returns null when the network dies', async () => {
    const dead = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await suggestGrade('note', 'attempt', dead)).toBeNull()
  })

  it('returns null on an unparseable body rather than guessing a grade', async () => {
    const junk = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch
    expect(await suggestGrade('note', 'attempt', junk)).toBeNull()
  })

  it('does not call the server without both halves', async () => {
    const f = ok(good)
    expect(await suggestGrade('', 'attempt', f)).toBeNull()
    expect(await suggestGrade('note', '   ', f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})
