import Dexie, { type EntityTable } from 'dexie'
import {
  DEFAULT_SETTINGS,
  STORES_V1,
  STORES_V2,
  type Book,
  type Meta,
  type Note,
  type ReadingLog,
  type Review,
  type ReviewSession,
  type Settings,
} from './schema'

export class ChapterDB extends Dexie {
  books!: EntityTable<Book, 'id'>
  readingLogs!: EntityTable<ReadingLog, 'id'>
  notes!: EntityTable<Note, 'id'>
  reviews!: EntityTable<Review, 'id'>
  sessions!: EntityTable<ReviewSession, 'id'>
  settings!: EntityTable<Settings, 'id'>
  meta!: EntityTable<Meta, 'id'>

  constructor(name = 'chapter') {
    super(name)
    // v1 shipped in Phase 1: books, chapters, notes.
    this.version(1).stores(STORES_V1)
    // v2 adds the review scheduler in Phase 3. Existing rows are untouched.
    this.version(2).stores(STORES_V2)
  }
}

export const db = new ChapterDB()

/** Idempotent. Safe to call on every launch. */
export async function ensureSettings(now = Date.now()): Promise<Settings> {
  const existing = await db.settings.get('settings')
  if (existing) return existing
  const fresh: Settings = { ...DEFAULT_SETTINGS, updatedAt: now }
  await db.settings.put(fresh)
  await db.meta.put({ id: 'meta', schemaVersion: 2, updatedAt: now })
  return fresh
}
