import { db } from './db'
import type { Book, Note, ReadingLog, Review, ReviewSession, Settings } from './schema'

/**
 * JSON export and import.
 *
 * Deleting the home-screen icon deletes every note, with no prompt and no
 * recycle bin. This file is the only backup that exists, which is why it ships
 * in Phase 2 rather than being left to the end.
 *
 * Cover images are deliberately excluded: they are blobs, they bloat the file
 * by megabytes, they are not user data, and they refetch from Open Library.
 */
export const BACKUP_FORMAT = 1

export interface Backup {
  format: number
  app: 'chapter'
  exportedAt: number
  counts: Record<string, number>
  books: Omit<Book, 'coverBlob'>[]
  readingLogs: ReadingLog[]
  notes: Note[]
  reviews: Review[]
  sessions: ReviewSession[]
  settings: Settings[]
}

export async function buildBackup(now = Date.now()): Promise<Backup> {
  const [books, readingLogs, notes, reviews, sessions, settings] = await Promise.all([
    db.books.toArray(),
    db.readingLogs.toArray(),
    db.notes.toArray(),
    db.reviews.toArray(),
    db.sessions.toArray(),
    db.settings.toArray(),
  ])

  return {
    format: BACKUP_FORMAT,
    app: 'chapter',
    exportedAt: now,
    counts: {
      books: books.length,
      readingLogs: readingLogs.length,
      notes: notes.length,
      reviews: reviews.length,
      sessions: sessions.length,
    },
    books: books.map(({ coverBlob: _coverBlob, ...rest }) => rest),
    readingLogs,
    notes,
    reviews,
    sessions,
    settings,
  }
}

export async function exportJson(now = Date.now()): Promise<string> {
  return JSON.stringify(await buildBackup(now), null, 2)
}

export function backupFilename(now = Date.now()): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `chapter-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

export class BackupError extends Error {}

export function parseBackup(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not JSON.')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupError('That file is not a Chapter backup.')
  }
  const b = parsed as Partial<Backup>
  if (b.app !== 'chapter') throw new BackupError('That backup is not from Chapter.')
  if (b.format !== BACKUP_FORMAT) {
    throw new BackupError(`That backup is format ${String(b.format)}; this app reads ${BACKUP_FORMAT}.`)
  }
  for (const table of ['books', 'readingLogs', 'notes'] as const) {
    if (!Array.isArray(b[table])) throw new BackupError(`The backup is missing its ${table}.`)
  }
  return {
    format: BACKUP_FORMAT,
    app: 'chapter',
    exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
    counts: b.counts ?? {},
    books: b.books ?? [],
    readingLogs: b.readingLogs ?? [],
    notes: b.notes ?? [],
    reviews: Array.isArray(b.reviews) ? b.reviews : [],
    sessions: Array.isArray(b.sessions) ? b.sessions : [],
    settings: Array.isArray(b.settings) ? b.settings : [],
  }
}

/**
 * Replace-all, never merge. Merging two divergent histories would need conflict
 * rules nobody has specified, and would quietly produce a database that is
 * neither backup. Everything happens in one transaction, so a bad import leaves
 * the existing data untouched rather than half-replaced.
 */
export async function importBackup(text: string): Promise<Backup['counts']> {
  const backup = parseBackup(text)

  await db.transaction(
    'rw',
    [db.books, db.readingLogs, db.notes, db.reviews, db.sessions, db.settings],
    async () => {
      await Promise.all([
        db.books.clear(),
        db.readingLogs.clear(),
        db.notes.clear(),
        db.reviews.clear(),
        db.sessions.clear(),
      ])
      // Covers were not exported; they refetch. `enrichFailed` is left as it
      // was so the shelf still offers to look them up.
      await db.books.bulkAdd(backup.books.map((b) => ({ ...b, coverBlob: null })))
      await db.readingLogs.bulkAdd(backup.readingLogs)
      await db.notes.bulkAdd(backup.notes)
      if (backup.reviews.length) await db.reviews.bulkAdd(backup.reviews)
      if (backup.sessions.length) await db.sessions.bulkAdd(backup.sessions)
      for (const s of backup.settings) await db.settings.put(s)
    },
  )

  return {
    books: backup.books.length,
    readingLogs: backup.readingLogs.length,
    notes: backup.notes.length,
    reviews: backup.reviews.length,
    sessions: backup.sessions.length,
  }
}

export type ShareOutcome = 'shared' | 'copied' | 'failed'

/**
 * Hands the backup to the user.
 *
 * NOT via `<a download href="blob:">` — that is broken in standalone WKWebView,
 * which is exactly where this app lives. The share sheet is the only reliable
 * route to Files or iCloud on iOS; the clipboard is the fallback.
 */
export async function shareBackup(
  json: string,
  filename: string,
  nav: Navigator = navigator,
): Promise<ShareOutcome> {
  try {
    if (typeof File !== 'undefined' && nav.share && nav.canShare) {
      const file = new File([json], filename, { type: 'application/json' })
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'Chapter backup' })
        return 'shared'
      }
    }
  } catch {
    // A cancelled share sheet lands here too — fall through to the clipboard.
  }
  try {
    // `nav.clipboard?.writeText(json)` would resolve to undefined when there is
    // no clipboard at all, and we would tell the user their backup was copied
    // when nothing happened.
    if (typeof nav.clipboard?.writeText !== 'function') return 'failed'
    await nav.clipboard.writeText(json)
    return 'copied'
  } catch {
    return 'failed'
  }
}
