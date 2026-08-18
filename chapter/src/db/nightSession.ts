import { db } from './db'
import { notesByIds, reviewsByIds, tonightsQueue } from './reviews'
import type { ReviewSession } from './schema'
import type { DayKey } from '../lib/day'

/**
 * Resolving a session into the cards the screen shows.
 *
 * This lives in src/db/ rather than in the component because SPEC.md 3 rule 2
 * says components never import Dexie, and because keeping the resolution next
 * to the writes is what stopped the grade and the session update drifting apart.
 */
export interface RecallItem {
  reviewId: string
  noteId: string
  chapterLabel: string
  body: string
  createdAt: number
  bookTitle: string
}

export interface HydratedSession {
  items: RecallItem[]
  /** Whether the FIRST item is the one the session recorded as revealed. */
  revealed: boolean
  /** Recomputed now, not read from the frozen row — a resume must not lie. */
  dueCount: number
  heldBack: number
}

export async function hydrateSession(
  session: ReviewSession,
  today: DayKey,
  cap: number,
): Promise<HydratedSession> {
  const reviews = await reviewsByIds(session.reviewIds)
  const stillPending = session.reviewIds
    .map((id) => reviews.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined && r.pending === 1)

  const notes = await notesByIds(stillPending.map((r) => r.noteId))
  const books = await db.books.toArray()
  const titleOf = new Map(books.map((b) => [b.id, b.title]))

  const items: RecallItem[] = []
  for (const r of stillPending) {
    const note = notes.get(r.noteId)
    if (!note) continue // its book was deleted out from under it
    items.push({
      reviewId: r.id,
      noteId: note.id,
      chapterLabel: note.chapterLabel,
      body: note.body,
      createdAt: note.createdAt,
      bookTitle: titleOf.get(note.bookId) ?? 'A book',
    })
  }

  const queue = await tonightsQueue(today, cap)

  return {
    items,
    // Only the item the session actually recorded. Restoring a bare boolean
    // would reveal whichever note happens to be first now.
    revealed: items.length > 0 && session.revealedReviewId === items[0]?.reviewId,
    dueCount: queue.dueCount,
    heldBack: queue.heldBack,
  }
}
