import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureSettings } from './db'
import {
  deleteBook,
  enrichAll,
  enrichBook,
  logChapter,
  percentFor,
  seedLibrary,
  setTodaysBook,
  updateBook,
} from './mutations'
import { SEED_BOOKS } from './seed'
import { allBooks, todaysBook } from './queries'

async function reset() {
  await db.delete()
  await db.open()
}

beforeEach(reset)

const okFetch = (body: unknown, coverBytes = 2048) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('covers.openlibrary.org')) {
      return new Response(new Uint8Array(coverBytes), { status: 200 })
    }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch

const deadFetch = vi.fn(async () => {
  throw new TypeError('Failed to fetch')
}) as unknown as typeof fetch

describe('percentFor', () => {
  it('computes a percentage from pages', () => {
    expect(percentFor('pages', 50, 200)).toBe(25)
  })

  it('returns 0 for a pages book with no page count — never invents a number', () => {
    expect(percentFor('pages', 50, null)).toBe(0)
    expect(percentFor('pages', 50, 0)).toBe(0)
  })

  it('takes a percent book at its word', () => {
    expect(percentFor('percent', 62.5, null)).toBe(62.5)
  })

  it('clamps out-of-range input rather than showing 1000%', () => {
    expect(percentFor('pages', 4000, 200)).toBe(100)
    expect(percentFor('percent', -20, null)).toBe(0)
    expect(percentFor('percent', 300, null)).toBe(100)
  })

  it('survives NaN', () => {
    expect(percentFor('percent', Number.NaN, null)).toBe(0)
  })
})

describe('seedLibrary', () => {
  it('seeds all 21 books', async () => {
    expect(await seedLibrary()).toBe(SEED_BOOKS.length)
    expect(await db.books.count()).toBe(21)
  })

  it('hardcodes NO page counts — every seeded book starts null', async () => {
    await seedLibrary()
    const books = await allBooks()
    expect(books).toHaveLength(21)
    for (const b of books) {
      expect(b.totalPages).toBeNull()
      expect(b.currentPage).toBeNull()
      expect(b.percentComplete).toBe(0)
    }
  })

  it('is idempotent — a second call adds nothing', async () => {
    await seedLibrary()
    expect(await seedLibrary()).toBe(0)
    expect(await db.books.count()).toBe(21)
  })

  it('pins exactly one book as today', async () => {
    await seedLibrary()
    const flagged = await db.books.where('isToday').equals(1).toArray()
    expect(flagged).toHaveLength(1)
  })
})

describe('enrichBook', () => {
  const match = {
    docs: [
      {
        key: '/works/OL1W',
        title: 'Think Again',
        author_name: ['Adam Grant'],
        cover_i: 99,
        number_of_pages_median: 320,
      },
    ],
  }

  it('fills in cover and page count on a high-confidence match', async () => {
    await seedLibrary()
    const book = (await allBooks()).find((b) => b.title === 'Think Again')!
    expect(await enrichBook(book.id, okFetch(match))).toBe('enriched')

    const after = (await db.books.get(book.id))!
    expect(after.totalPages).toBe(320)
    expect(after.coverUrl).toContain('99')
    expect(after.coverBlob).toBeInstanceOf(Blob)
    expect(after.enrichFailed).toBe(false)
  })

  it('leaves the book fully usable when the lookup fails', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    expect(await enrichBook(book.id, deadFetch)).toBe('failed')

    const after = (await db.books.get(book.id))!
    expect(after.totalPages).toBeNull()
    expect(after.enrichFailed).toBe(true)
    expect(after.enrichAttemptedAt).not.toBeNull()
    // Still loggable — that is the point.
    await expect(
      logChapter({ bookId: book.id, chapterLabel: 'Ch 1', position: 12, body: 'still works' }),
    ).resolves.toBeTruthy()
  })

  it('takes a cover but REFUSES a page count from a weak author match', async () => {
    await seedLibrary()
    const book = (await allBooks()).find((b) => b.title === 'Think Again')!
    const weak = {
      docs: [
        {
          key: '/works/OTHER',
          title: 'Think Again',
          author_name: ['Not Adam'],
          cover_i: 77,
          number_of_pages_median: 900,
        },
      ],
    }
    expect(await enrichBook(book.id, okFetch(weak))).toBe('partial')

    const after = (await db.books.get(book.id))!
    expect(after.totalPages).toBeNull()
    expect(after.coverUrl).toContain('77')
    expect(after.enrichFailed).toBe(true)
  })

  it('never overwrites a page count the user corrected by hand', async () => {
    await seedLibrary()
    const book = (await allBooks()).find((b) => b.title === 'Think Again')!
    await updateBook(book.id, { totalPages: 288 })
    await enrichBook(book.id, okFetch(match))
    expect((await db.books.get(book.id))!.totalPages).toBe(288)
  })

  it('discards a suspiciously tiny cover body', async () => {
    await seedLibrary()
    const book = (await allBooks()).find((b) => b.title === 'Think Again')!
    await enrichBook(book.id, okFetch(match, 100))
    expect((await db.books.get(book.id))!.coverBlob).toBeNull()
  })
})

describe('enrichAll', () => {
  it('reports a tally and never throws when the network is dead', async () => {
    await seedLibrary()
    const tally = await enrichAll(deadFetch, undefined, 0)
    expect(tally.failed).toBe(21)
    expect(tally.enriched).toBe(0)
    expect(await db.books.count()).toBe(21)
  })
})

describe('logChapter', () => {
  it('writes the log, the note and the progress in one go', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await updateBook(book.id, { totalPages: 200 })

    const result = await logChapter({
      bookId: book.id,
      chapterLabel: 'Chapter 3',
      position: 50,
      body: 'Buying back time means selling the tasks that drain you, not the ones you are worst at.',
    })

    expect(result.percentBefore).toBe(0)
    expect(result.percentAfter).toBe(25)
    expect(await db.readingLogs.count()).toBe(1)
    expect(await db.notes.count()).toBe(1)

    const after = (await db.books.get(book.id))!
    expect(after.currentPage).toBe(50)
    expect(after.percentComplete).toBe(25)

    const note = (await db.notes.toArray())[0]!
    expect(note.readingLogId).toBe(result.log.id)
    expect(note.chapterLabel).toBe('Chapter 3')
    expect(note.source).toBe('typed')
  })

  it('handles a percent book and never writes a page number to it', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await updateBook(book.id, { progressUnit: 'percent' })

    await logChapter({ bookId: book.id, chapterLabel: 'Part 2', position: 41, body: 'audio note' })

    const after = (await db.books.get(book.id))!
    expect(after.percentComplete).toBe(41)
    expect(after.currentPage).toBeNull()
  })

  it('logs against a book with no page count at all', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    const r = await logChapter({
      bookId: book.id,
      chapterLabel: 'Ch 1',
      position: 34,
      body: 'no total yet',
    })
    expect(r.percentAfter).toBe(0)
    expect((await db.books.get(book.id))!.currentPage).toBe(34)
  })

  it('refuses an empty note — the note is the whole point', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await expect(
      logChapter({ bookId: book.id, chapterLabel: 'Ch 1', position: 1, body: '   ' }),
    ).rejects.toThrow()
    expect(await db.readingLogs.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
  })

  it('rolls back entirely when the book does not exist', async () => {
    await expect(
      logChapter({ bookId: 'nope', chapterLabel: 'Ch 1', position: 1, body: 'x' }),
    ).rejects.toThrow()
    expect(await db.readingLogs.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
  })

  it('records two chapters on the same day as two logs', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await logChapter({ bookId: book.id, chapterLabel: 'Ch 1', position: 10, body: 'one' })
    await logChapter({ bookId: book.id, chapterLabel: 'Ch 2', position: 20, body: 'two' })
    expect(await db.readingLogs.count()).toBe(2)
  })
})

describe('updateBook', () => {
  it('recomputes the percentage when the page count is corrected', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await logChapter({ bookId: book.id, chapterLabel: 'Ch 1', position: 60, body: 'x' })
    expect((await db.books.get(book.id))!.percentComplete).toBe(0)

    await updateBook(book.id, { totalPages: 240 })
    expect((await db.books.get(book.id))!.percentComplete).toBe(25)
  })

  it('drops the page number when a book switches to percent', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await updateBook(book.id, { totalPages: 200, currentPage: 100 })
    expect((await db.books.get(book.id))!.percentComplete).toBe(50)

    await updateBook(book.id, { progressUnit: 'percent' })
    const after = (await db.books.get(book.id))!
    expect(after.currentPage).toBeNull()
    expect(after.percentComplete).toBe(50)
  })
})

describe('setTodaysBook / todaysBook', () => {
  it('moves the flag so only one book carries it', async () => {
    await seedLibrary()
    const books = await allBooks()
    await setTodaysBook(books[4]!.id)
    const flagged = await db.books.where('isToday').equals(1).toArray()
    expect(flagged).toHaveLength(1)
    expect(flagged[0]!.id).toBe(books[4]!.id)
    expect((await todaysBook())!.id).toBe(books[4]!.id)
  })

  it('falls back to the most recently read book when nothing is pinned', async () => {
    await seedLibrary()
    const books = await allBooks()
    await db.books.update(books[0]!.id, { isToday: 0 })
    await logChapter({ bookId: books[7]!.id, chapterLabel: 'Ch 1', position: 5, body: 'x' })
    expect((await todaysBook())!.id).toBe(books[7]!.id)
  })
})

describe('deleteBook', () => {
  it('cascades and reports the counts, leaving no orphans', async () => {
    await seedLibrary()
    const book = (await allBooks())[0]!
    await logChapter({ bookId: book.id, chapterLabel: 'Ch 1', position: 1, body: 'a' })
    await logChapter({ bookId: book.id, chapterLabel: 'Ch 2', position: 2, body: 'b' })

    const counts = await deleteBook(book.id)
    expect(counts).toEqual({ logs: 2, notes: 2, reviews: 2 })
    expect(await db.books.count()).toBe(20)
    expect(await db.readingLogs.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
    expect(await db.reviews.count()).toBe(0)
  })
})

describe('ensureSettings', () => {
  it('creates defaults once and does not clobber them', async () => {
    const first = await ensureSettings()
    expect(first.reviewCap).toBe(5)
    expect(first.darkFromHour).toBe(19)
    await db.settings.update('settings', { reviewCap: 9 })
    expect((await ensureSettings()).reviewCap).toBe(9)
  })
})
