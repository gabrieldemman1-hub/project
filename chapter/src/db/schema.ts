import type { DayKey } from '../lib/day'

export type ProgressUnit = 'pages' | 'percent'
export type BookStatus = 'reading' | 'finished' | 'paused'
export type NoteSource = 'typed' | 'voice'
export type Grade = 'got_it' | 'partial' | 'missed'
export type ThemeMode = 'auto' | 'light' | 'dark'

/**
 * IndexedDB cannot index `null` or `boolean` values — a row whose indexed
 * property is either is silently missing from that index. Anything we query on
 * is therefore stored as 0 | 1 (`isToday`, `pending`) with the richer value kept
 * alongside it as plain data. Getting this wrong makes pending reviews
 * invisible, which would be a very quiet, very bad bug.
 */
export type Flag = 0 | 1

export interface Book {
  id: string
  title: string
  author: string
  progressUnit: ProgressUnit
  /** Null until Open Library or the user fills it. Never hardcoded — SPEC.md 4.7. */
  totalPages: number | null
  currentPage: number | null
  percentComplete: number
  coverUrl: string | null
  coverBlob: Blob | null
  olKey: string | null
  enrichAttemptedAt: number | null
  enrichFailed: boolean
  status: BookStatus
  isToday: Flag
  sortIndex: number
  addedAt: number
  updatedAt: number
}

export interface ReadingLog {
  id: string
  bookId: string
  chapterLabel: string
  /** A page number when progressUnit is 'pages', a percent when it is 'percent'. */
  position: number
  progressUnit: ProgressUnit
  percentAfter: number | null
  loggedAt: number
  dayKey: DayKey
  /**
   * The device's UTC offset when this row was written. Nothing reads it today.
   * It costs nothing (unindexed), and without it a future change to
   * DAY_ROLLOVER_HOUR could never backfill history, and a disputed streak would
   * have no forensic trail.
   */
  tzOffsetMinutes: number
  noteId: string | null
  updatedAt: number
}

export interface Note {
  id: string
  bookId: string
  readingLogId: string
  chapterLabel: string
  /** The user's own words. Always rendered in the serif face. */
  body: string
  source: NoteSource
  createdAt: number
  dayKey: DayKey
  tzOffsetMinutes: number
  updatedAt: number
}

export interface Review {
  id: string
  noteId: string
  dueDate: DayKey
  intervalIndex: number
  /** null while pending. Kept forever once graded. */
  result: Grade | null
  /** 1 while pending, 0 once graded. Indexed; `result` is not. */
  pending: Flag
  reviewedAt: number | null
  createdAt: number
  updatedAt: number
}

/**
 * A night session is a PERSISTED entity, not in-memory state.
 *
 * iOS discards a backgrounded web app and relaunches it cold from start_url.
 * If the queue lived in memory, locking the phone halfway through recall would
 * come back with a different five notes — and the notes already graded would be
 * gone from the queue while the ones not yet seen were reshuffled.
 */
export interface ReviewSession {
  id: string
  kind: 'review'
  dayKey: DayKey
  tzOffsetMinutes: number
  startedAt: number
  endedAt: number | null
  /** The review rows this session committed to, in order, chosen once at start. */
  reviewIds: string[]
  currentIndex: number
  /** Survives a relaunch, so a revealed note is not re-hidden mid-thought. */
  revealed: boolean
  served: number
  graded: number
  /** What the cap held back, so the screen can say so after a relaunch too. */
  heldBack: number
  dueCount: number
  updatedAt: number
}

export interface Settings {
  id: 'settings'
  themeMode: ThemeMode
  themeOverrideDay: DayKey | null
  darkFromHour: number
  reviewCap: number
  lastBackupAt: number | null
  seedVersion: number
  updatedAt: number
}

export interface Meta {
  id: 'meta'
  schemaVersion: number
  updatedAt: number
}

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  id: 'settings',
  themeMode: 'auto',
  themeOverrideDay: null,
  darkFromHour: 19,
  reviewCap: 5,
  lastBackupAt: null,
  seedVersion: 0,
}

/** Dexie index declarations, one place, so schema.test.ts can assert against them. */
export const STORES_V1 = {
  books: 'id, sortIndex, status, isToday, title',
  readingLogs: 'id, bookId, dayKey, loggedAt',
  notes: 'id, bookId, readingLogId, dayKey, createdAt',
  settings: 'id',
  meta: 'id',
} as const

export const STORES_V2 = {
  ...STORES_V1,
  reviews: 'id, noteId, dueDate, pending, [pending+dueDate]',
  sessions: 'id, dayKey, kind, endedAt',
} as const
