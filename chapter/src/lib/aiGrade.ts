/**
 * AI recall grading — Phase 4 Step B, client half.
 *
 * The model ADVISES. It never decides. Everything here returns a suggestion the
 * user accepts or overrides, and every failure returns null so the night
 * session falls straight back to manual grading with nothing lost.
 */
import type { Grade } from './scheduler'

export interface GradeSuggestion {
  gotRight: string[]
  missed: string[]
  suggestedGrade: Grade
  reason: string
}

const GRADES: Grade[] = ['got_it', 'partial', 'missed']

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}

/** Pure — separately tested, so the parsing is covered without a network. */
export function parseSuggestion(payload: unknown): GradeSuggestion | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>

  const grade = p['suggested_grade']
  if (typeof grade !== 'string' || !GRADES.includes(grade as Grade)) return null

  const reason = typeof p['reason'] === 'string' ? p['reason'].trim() : ''
  const gotRight = asStrings(p['got_right'])
  const missed = asStrings(p['missed'])

  // A suggestion with no substance is worse than none — it would look like the
  // model had an opinion when it did not.
  if (reason === '' && gotRight.length === 0 && missed.length === 0) return null

  return { gotRight, missed, suggestedGrade: grade as Grade, reason }
}

export async function suggestGrade(
  note: string,
  attempt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GradeSuggestion | null> {
  if (!note.trim() || !attempt.trim()) return null
  try {
    const res = await fetchImpl('/api/grade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note, attempt }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) return null
    return parseSuggestion(await res.json())
  } catch {
    return null
  }
}
