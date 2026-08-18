/**
 * Open Library enrichment: covers and page counts for the seeded library.
 *
 * Two rules shape this file.
 *
 * 1. The book must stay fully usable when every lookup fails. `lookup` returns
 *    null on every failure path — offline, 404, 429, malformed JSON, no match,
 *    weak match — and never throws into the UI.
 * 2. A wrong page count silently corrupts every percentage you will ever see
 *    for that book, so a low-confidence match may contribute a cover but NEVER
 *    a page count.
 *
 * `pickMatch` is pure and tested against recorded payloads, so the matching
 * logic is covered without a network — which matters, because the build sandbox
 * cannot reach openlibrary.org at all.
 */

const SEARCH = 'https://openlibrary.org/search.json'
const COVER = 'https://covers.openlibrary.org/b/id'
const TIMEOUT_MS = 6000

export type Confidence = 'high' | 'low'

export interface OLMatch {
  olKey: string
  title: string
  author: string
  coverUrl: string | null
  /** Null whenever confidence is 'low', regardless of what the API returned. */
  totalPages: number | null
  confidence: Confidence
}

interface OLDoc {
  key?: unknown
  title?: unknown
  author_name?: unknown
  cover_i?: unknown
  number_of_pages_median?: unknown
}

export function buildSearchUrl(title: string, author: string): string {
  const q = new URLSearchParams({
    title,
    author,
    fields: 'key,title,author_name,cover_i,number_of_pages_median',
    limit: '5',
  })
  return `${SEARCH}?${q.toString()}`
}

export function coverUrlFor(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  // `default=false` makes a missing cover return 404 instead of a grey
  // placeholder image, so we can tell "no cover" from "a cover that is a
  // picture of nothing" and fall back to the typographic cover instead.
  return `${COVER}/${coverId}-${size}.jpg?default=false`
}

/** Lowercase, strip punctuation, collapse spaces. '$100M Offers' -> '100m offers'. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(author: string): string[] {
  return normalise(author)
    .split(' ')
    .filter((part) => part.length > 2)
}

/**
 * The surnames we require a candidate to contain.
 *
 * Matching on ALL name tokens is too loose: 'Not Adam' shares 'adam' with
 * 'Adam Grant' and would sail through, taking a wrong page count with it. So we
 * key on surnames only — the last token of the name. A comma-separated credit
 * like 'Patterson, Grenny, McMillan, Switzler' contributes every one of its
 * surnames, since Open Library will usually list only the first two.
 */
export function surnames(author: string): string[] {
  const parts = author.includes(',') ? author.split(',') : [author]
  const out: string[] = []
  for (const part of parts) {
    const t = tokens(part)
    const last = t[t.length - 1]
    if (last) out.push(last)
  }
  return out
}

/**
 * Third-party summaries and workbooks rank highly on these titles and are a
 * different book entirely. Without this, '$100M Offers' can pick up the cover of
 * 'Summary of $100M Offers by Alex Hormozi' — which even passes the author
 * check, because the real author's name is in the summary's title.
 */
const PARASITE = /\b(summary|summaries|workbook|study guide|analysis of|key takeaways|condensed|companion|conversation starters)\b/

export function isParasiteTitle(title: string): boolean {
  return PARASITE.test(normalise(title))
}

function titleScore(candidate: string, wanted: string): number {
  const c = normalise(candidate)
  const w = normalise(wanted)
  if (c === w) return 3
  if (c.startsWith(w) || w.startsWith(c)) return 2
  if (c.includes(w) || w.includes(c)) return 1
  return 0
}

/** True when any surname we expect appears anywhere in the credited authors. */
export function authorAgrees(candidates: string[], wanted: string): boolean {
  const want = surnames(wanted)
  if (want.length === 0) return false
  const have = new Set(candidates.flatMap(tokens))
  return want.some((surname) => have.has(surname))
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Picks the best document from a search payload, or null if nothing is close
 * enough to be worth storing. Pure — no network, no clock.
 */
export function pickMatch(payload: unknown, title: string, author: string): OLMatch | null {
  if (typeof payload !== 'object' || payload === null) return null
  const docs = (payload as { docs?: unknown }).docs
  if (!Array.isArray(docs)) return null

  let best: { doc: OLDoc; score: number; agrees: boolean } | null = null

  for (const raw of docs) {
    if (typeof raw !== 'object' || raw === null) continue
    const doc = raw as OLDoc
    if (typeof doc.title !== 'string' || typeof doc.key !== 'string') continue

    // A summary of the book is not the book.
    if (isParasiteTitle(doc.title) && !isParasiteTitle(title)) continue

    const score = titleScore(doc.title, title)
    if (score === 0) continue

    const agrees = authorAgrees(asStringArray(doc.author_name), author)
    // An agreeing author outranks a better title match, because the failure we
    // are guarding against is storing another author's page count.
    const rank = score + (agrees ? 10 : 0)
    const bestRank = best ? best.score + (best.agrees ? 10 : 0) : -1
    if (rank > bestRank) best = { doc, score, agrees }
  }

  if (!best) return null

  const coverId = asNumber(best.doc.cover_i)
  const confidence: Confidence = best.agrees && best.score >= 2 ? 'high' : 'low'

  return {
    olKey: best.doc.key as string,
    title: best.doc.title as string,
    author: asStringArray(best.doc.author_name)[0] ?? author,
    coverUrl: coverId ? coverUrlFor(coverId) : null,
    // The rule that protects every percentage in the app.
    totalPages: confidence === 'high' ? asNumber(best.doc.number_of_pages_median) : null,
    confidence,
  }
}

/**
 * Network wrapper. `fetchImpl` is injectable so every path is testable without
 * a network — the build sandbox has none.
 */
export async function lookup(
  title: string,
  author: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OLMatch | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(buildSearchUrl(title, author), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const payload: unknown = await res.json()
    return pickMatch(payload, title, author)
  } catch {
    // Offline, aborted, malformed JSON, CORS — all the same to the caller.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetches a cover as a blob so the shelf still renders offline. Failure is not
 * an error — the book just keeps its URL, or falls back to a typographic cover.
 */
export async function fetchCoverBlob(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob | null> {
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const blob = await res.blob()
    // Open Library serves a 1x1 or tiny body when it has nothing useful.
    return blob.size > 512 ? blob : null
  } catch {
    return null
  }
}

/**
 * Courtesy pacing when enriching a whole shelf from one browser. 21 books at a
 * second each is 21 seconds once; being rate-limited is far more expensive.
 */
export const ENRICH_DELAY_MS = 1000
