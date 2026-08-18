import { db, ensureSettings } from './db'
import { SEED_BOOKS, SEED_VERSION } from './seed'
import { newId } from '../lib/ids'
import { dayKeyOf } from '../lib/day'
import { ENRICH_DELAY_MS, fetchCoverBlob, lookup } from '../lib/openLibrary'
import { firstReview } from '../lib/scheduler'
import { reviewRowFor } from './reviews'
import type { Book, Note, ProgressUnit, ReadingLog, Settings } from './schema'

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10))
}

/**
 * The one place progress is computed. A 'pages' book with no page count yet has
 * no meaningful percentage — it keeps 0 and the UI shows the raw page instead
 * of inventing a number.
 */
export function percentFor(
  unit: ProgressUnit,
  position: number,
  totalPages: number | null,
): number {
  if (unit === 'percent') return clampPercent(position)
  if (!totalPages || totalPages <= 0) return 0
  return clampPercent((position / totalPages) * 100)
}

/** Idempotent: seeds only when the shelf has never been seeded at this version. */
export async function seedLibrary(now = Date.now()): Promise<number> {
  const settings = await ensureSettings(now)
  if (settings.seedVersion >= SEED_VERSION) return 0

  const existing = await db.books.count()
  if (existing > 0) {
    await db.settings.update('settings', { seedVersion: SEED_VERSION, updatedAt: now })
    return 0
  }

  const books: Book[] = SEED_BOOKS.map((seed, i) => ({
    id: newId('bk'),
    title: seed.title,
    author: seed.author,
    progressUnit: seed.progressUnit,
    totalPages: null,
    currentPage: null,
    percentComplete: 0,
    coverUrl: null,
    coverBlob: null,
    olKey: null,
    enrichAttemptedAt: null,
    enrichFailed: false,
    status: 'reading',
    isToday: i === 0 ? 1 : 0,
    sortIndex: i,
    addedAt: now,
    updatedAt: now,
  }))

  await db.books.bulkAdd(books)
  await db.settings.update('settings', { seedVersion: SEED_VERSION, updatedAt: now })
  return books.length
}

/**
 * Fills in cover and page count from Open Library. Every failure leaves the
 * book usable and flagged so the UI can offer manual entry — it never throws.
 */
export async function enrichBook(
  bookId: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<'enriched' | 'partial' | 'failed'> {
  const book = await db.books.get(bookId)
  if (!book) return 'failed'

  const match = await lookup(book.title, book.author, fetchImpl)
  if (!match) {
    await db.books.update(bookId, {
      enrichAttemptedAt: now,
      enrichFailed: true,
      updatedAt: now,
    })
    return 'failed'
  }

  const blob = match.coverUrl ? await fetchCoverBlob(match.coverUrl, fetchImpl) : null

  const patch: Partial<Book> = {
    olKey: match.olKey,
    coverUrl: match.coverUrl,
    coverBlob: blob,
    enrichAttemptedAt: now,
    // A weak match still leaves the page count for the user to supply.
    enrichFailed: match.totalPages === null,
    updatedAt: now,
  }

  // Never overwrite a page count the user has already corrected by hand.
  if (match.totalPages !== null && book.totalPages === null) {
    patch.totalPages = match.totalPages
    patch.percentComplete = percentFor(
      book.progressUnit,
      book.currentPage ?? 0,
      match.totalPages,
    )
  }

  await db.books.update(bookId, patch)
  return match.totalPages !== null ? 'enriched' : 'partial'
}

/** Enriches the whole shelf, paced so one browser isn't hammering the API. */
export async function enrichAll(
  fetchImpl: typeof fetch = fetch,
  onProgress?: (done: number, total: number) => void,
  delayMs = ENRICH_DELAY_MS,
): Promise<{ enriched: number; partial: number; failed: number }> {
  const books = await db.books.toArray()
  const tally = { enriched: 0, partial: 0, failed: 0 }
  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    if (!book) continue
    const result = await enrichBook(book.id, fetchImpl)
    tally[result] += 1
    onProgress?.(i + 1, books.length)
    if (delayMs > 0 && i < books.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return tally
}

export interface BookPatch {
  title?: string
  author?: string
  progressUnit?: ProgressUnit
  totalPages?: number | null
  currentPage?: number | null
  coverUrl?: string | null
  status?: Book['status']
}

/** Recomputes progress whenever anything it depends on changes. */
export async function updateBook(
  id: string,
  patch: BookPatch,
  now = Date.now(),
): Promise<void> {
  const book = await db.books.get(id)
  if (!book) return

  const merged: Book = { ...book, ...patch, updatedAt: now }
  const unit = merged.progressUnit
  const position = unit === 'pages' ? (merged.currentPage ?? 0) : merged.percentComplete
  merged.percentComplete = percentFor(unit, position, merged.totalPages)
  if (unit === 'percent') merged.currentPage = null

  await db.books.put(merged)
}

/** Exactly one book carries the flag. */
export async function setTodaysBook(id: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.books, async () => {
    const flagged = await db.books.where('isToday').equals(1).toArray()
    for (const b of flagged) {
      await db.books.update(b.id, { isToday: 0, updatedAt: now })
    }
    await db.books.update(id, { isToday: 1, updatedAt: now })
  })
}

export interface LogChapterInput {
  bookId: string
  chapterLabel: string
  /** Page number for 'pages' books, percent for 'percent' books. */
  position: number
  body: string
  source?: Note['source']
  now?: number
}

export interface LogChapterResult {
  log: ReadingLog
  note: Note
  percentBefore: number
  percentAfter: number
}

/**
 * The morning ritual, written as ONE transaction so a killed app can never
 * leave a logged chapter without its note, or the reverse.
 */
export async function logChapter(input: LogChapterInput): Promise<LogChapterResult> {
  const now = input.now ?? Date.now()
  const body = input.body.trim()
  if (!body) throw new Error('A chapter log needs a note — that is the whole point.')

  return db.transaction('rw', db.books, db.readingLogs, db.notes, db.reviews, async () => {
    const book = await db.books.get(input.bookId)
    if (!book) throw new Error(`No such book: ${input.bookId}`)

    const percentBefore = book.percentComplete
    const percentAfter = percentFor(book.progressUnit, input.position, book.totalPages)
    const logId = newId('log')
    const noteId = newId('nt')
    const dayKey = dayKeyOf(now)
    const tzOffsetMinutes = new Date(now).getTimezoneOffset()

    const log: ReadingLog = {
      id: logId,
      bookId: book.id,
      chapterLabel: input.chapterLabel.trim() || 'Chapter',
      position: input.position,
      progressUnit: book.progressUnit,
      percentAfter,
      loggedAt: now,
      dayKey,
      tzOffsetMinutes,
      noteId,
      updatedAt: now,
    }

    const note: Note = {
      id: noteId,
      bookId: book.id,
      readingLogId: logId,
      chapterLabel: log.chapterLabel,
      body,
      source: input.source ?? 'typed',
      createdAt: now,
      dayKey,
      tzOffsetMinutes,
      updatedAt: now,
    }

    await db.readingLogs.add(log)
    await db.notes.add(note)
    // The note's first review is created in the SAME transaction. A note
    // without a pending review would silently never come back.
    await db.reviews.add(reviewRowFor(noteId, firstReview(dayKey), now))
    await db.books.update(book.id, {
      currentPage: book.progressUnit === 'pages' ? input.position : null,
      percentComplete: percentAfter,
      updatedAt: now,
    })

    return { log, note, percentBefore, percentAfter }
  })
}

export async function updateSettings(
  patch: Partial<Omit<Settings, 'id'>>,
  now = Date.now(),
): Promise<void> {
  await ensureSettings(now)
  await db.settings.update('settings', { ...patch, updatedAt: now })
}

/** Counted cascade — the caller shows these numbers before confirming. */
export async function deleteBook(
  id: string,
): Promise<{ logs: number; notes: number; reviews: number }> {
  return db.transaction('rw', db.books, db.readingLogs, db.notes, db.reviews, async () => {
    const logs = await db.readingLogs.where('bookId').equals(id).toArray()
    const notes = await db.notes.where('bookId').equals(id).toArray()
    const noteIds = new Set(notes.map((n) => n.id))
    // Reviews hang off notes, not books, so they have to be found by note id
    // or they survive their own book and come back for review forever.
    const reviews = (await db.reviews.toArray()).filter((r) => noteIds.has(r.noteId))

    await db.readingLogs.bulkDelete(logs.map((l) => l.id))
    await db.notes.bulkDelete(notes.map((n) => n.id))
    await db.reviews.bulkDelete(reviews.map((r) => r.id))
    await db.books.delete(id)
    return { logs: logs.length, notes: notes.length, reviews: reviews.length }
  })
}
