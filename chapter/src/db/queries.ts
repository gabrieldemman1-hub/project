import { db } from './db'
import type { Book, Note, ReadingLog } from './schema'

export async function allBooks(): Promise<Book[]> {
  const books = await db.books.toArray()
  return books.sort((a, b) => a.sortIndex - b.sortIndex)
}

export async function getBook(id: string): Promise<Book | undefined> {
  return db.books.get(id)
}

export async function todaysBook(): Promise<Book | undefined> {
  const flagged = await db.books.where('isToday').equals(1).first()
  if (flagged) return flagged
  // Fall back to the most recently read book, then to the first on the shelf,
  // so the dashboard is never empty just because nothing was pinned.
  const lastLog = await db.readingLogs.orderBy('loggedAt').reverse().first()
  if (lastLog) {
    const book = await db.books.get(lastLog.bookId)
    if (book) return book
  }
  return (await allBooks())[0]
}

export async function logsForBook(bookId: string): Promise<ReadingLog[]> {
  const logs = await db.readingLogs.where('bookId').equals(bookId).toArray()
  return logs.sort((a, b) => b.loggedAt - a.loggedAt)
}

export async function notesForBook(bookId: string): Promise<Note[]> {
  const notes = await db.notes.where('bookId').equals(bookId).toArray()
  return notes.sort((a, b) => b.createdAt - a.createdAt)
}

export async function allLogs(): Promise<ReadingLog[]> {
  return db.readingLogs.toArray()
}

export async function recentNotes(limit = 20): Promise<Note[]> {
  return db.notes.orderBy('createdAt').reverse().limit(limit).toArray()
}

export async function countsForBook(
  bookId: string,
): Promise<{ logs: number; notes: number }> {
  const [logs, notes] = await Promise.all([
    db.readingLogs.where('bookId').equals(bookId).count(),
    db.notes.where('bookId').equals(bookId).count(),
  ])
  return { logs, notes }
}

/** Every day on which a chapter was logged. Feeds ONLY the reading streak. */
export async function readingDays(): Promise<{ dayKey: string }[]> {
  const logs = await db.readingLogs.toArray()
  return logs.map((l) => ({ dayKey: l.dayKey }))
}

/** Every day on which a review session was CLOSED. Feeds ONLY the review streak. */
export async function reviewSessionDays(): Promise<{ dayKey: string }[]> {
  const sessions = await db.sessions.where('kind').equals('review').toArray()
  return sessions.filter((s) => s.endedAt !== null).map((s) => ({ dayKey: s.dayKey }))
}

export async function logsOnDay(dayKey: string): Promise<ReadingLog[]> {
  return db.readingLogs.where('dayKey').equals(dayKey).toArray()
}

export async function getSettings() {
  return db.settings.get('settings')
}
