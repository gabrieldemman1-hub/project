import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureSettings } from './db'
import { logChapter, seedLibrary, updateBook } from './mutations'
import { allBooks } from './queries'
import {
  BackupError,
  backupFilename,
  buildBackup,
  exportJson,
  importBackup,
  parseBackup,
  shareBackup,
} from './backup'

async function reset() {
  await db.delete()
  await db.open()
  await ensureSettings()
}

beforeEach(reset)

async function populate() {
  await seedLibrary()
  const books = await allBooks()
  await updateBook(books[0]!.id, { totalPages: 240 })
  await logChapter({ bookId: books[0]!.id, chapterLabel: 'Ch 1', position: 30, body: 'first idea' })
  await logChapter({ bookId: books[1]!.id, chapterLabel: 'Ch 1', position: 12, body: 'second idea' })
  return books
}

describe('buildBackup', () => {
  it('captures every table and reports its counts', async () => {
    await populate()
    const backup = await buildBackup(1000)
    expect(backup.app).toBe('chapter')
    expect(backup.format).toBe(1)
    expect(backup.counts).toMatchObject({ books: 21, readingLogs: 2, notes: 2 })
  })

  it('excludes cover blobs — they are megabytes and they refetch', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await db.books.update(book.id, { coverBlob: new Blob([new Uint8Array(4096)]) })
    const backup = await buildBackup()
    for (const b of backup.books) {
      expect('coverBlob' in b).toBe(false)
    }
    expect(JSON.stringify(backup)).not.toContain('coverBlob')
  })
})

describe('export / import round trip', () => {
  it('restores every note and log exactly', async () => {
    await populate()
    const before = {
      books: await db.books.toArray(),
      logs: await db.readingLogs.toArray(),
      notes: await db.notes.toArray(),
    }
    const json = await exportJson()

    await reset()
    expect(await db.notes.count()).toBe(0)

    const counts = await importBackup(json)
    expect(counts.notes).toBe(2)

    const after = {
      books: await db.books.toArray(),
      logs: await db.readingLogs.toArray(),
      notes: await db.notes.toArray(),
    }
    expect(after.notes.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      before.notes.sort((a, b) => a.id.localeCompare(b.id)),
    )
    expect(after.logs.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      before.logs.sort((a, b) => a.id.localeCompare(b.id)),
    )
    expect(after.books).toHaveLength(before.books.length)
  })

  it('replaces rather than merges', async () => {
    await populate()
    const json = await exportJson()
    // Add something after the export; it must not survive the restore.
    const books = await allBooks()
    await logChapter({ bookId: books[2]!.id, chapterLabel: 'Extra', position: 5, body: 'later' })
    expect(await db.notes.count()).toBe(3)

    await importBackup(json)
    expect(await db.notes.count()).toBe(2)
  })

  it('nulls the cover blob on restore rather than leaving the field missing', async () => {
    await populate()
    const json = await exportJson()
    await reset()
    await importBackup(json)
    for (const b of await db.books.toArray()) {
      expect(b.coverBlob).toBeNull()
    }
  })
})

describe('parseBackup rejects bad input safely', () => {
  it('refuses non-JSON', () => {
    expect(() => parseBackup('{not json')).toThrow(BackupError)
  })

  it('refuses another app’s backup', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'workouts', format: 1 }))).toThrow(/not from Chapter/)
  })

  it('refuses a future format rather than importing it half-understood', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'chapter', format: 99 }))).toThrow(/format 99/)
  })

  it('refuses a backup with tables missing', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'chapter', format: 1, books: [] }))).toThrow(
      /missing its readingLogs/,
    )
  })

  it('tolerates a backup with no reviews or sessions yet', () => {
    const parsed = parseBackup(
      JSON.stringify({ app: 'chapter', format: 1, books: [], readingLogs: [], notes: [] }),
    )
    expect(parsed.reviews).toEqual([])
    expect(parsed.sessions).toEqual([])
  })
})

describe('a failed import leaves the existing data intact', () => {
  it('does not clear anything when the file is rubbish', async () => {
    await populate()
    await expect(importBackup('nonsense')).rejects.toThrow(BackupError)
    expect(await db.notes.count()).toBe(2)
    expect(await db.books.count()).toBe(21)
  })
})

describe('shareBackup', () => {
  const json = '{"app":"chapter"}'

  it('uses the share sheet when it can take files', async () => {
    const share = vi.fn(async () => undefined)
    const nav = { share, canShare: () => true, clipboard: { writeText: vi.fn() } }
    expect(await shareBackup(json, 'x.json', nav as unknown as Navigator)).toBe('shared')
    expect(share).toHaveBeenCalled()
  })

  it('falls back to the clipboard when sharing files is unsupported', async () => {
    const writeText = vi.fn(async () => undefined)
    const nav = { share: vi.fn(), canShare: () => false, clipboard: { writeText } }
    expect(await shareBackup(json, 'x.json', nav as unknown as Navigator)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(json)
  })

  it('falls back to the clipboard when the user cancels the share sheet', async () => {
    const writeText = vi.fn(async () => undefined)
    const nav = {
      share: vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError')
      }),
      canShare: () => true,
      clipboard: { writeText },
    }
    expect(await shareBackup(json, 'x.json', nav as unknown as Navigator)).toBe('copied')
  })

  it('reports failure rather than throwing when nothing works', async () => {
    const nav = {}
    expect(await shareBackup(json, 'x.json', nav as unknown as Navigator)).toBe('failed')
  })
})

describe('backupFilename', () => {
  it('is dated so successive backups do not overwrite each other', () => {
    expect(backupFilename(new Date(2026, 7, 5, 12).getTime())).toBe('chapter-2026-08-05.json')
  })
})
