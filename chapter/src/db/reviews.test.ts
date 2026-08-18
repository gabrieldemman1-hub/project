import { beforeEach, describe, expect, it } from 'vitest'
import { db, ensureSettings } from './db'
import { deleteBook, logChapter, seedLibrary } from './mutations'
import { allBooks } from './queries'
import {
  abandonSession,
  closeSession,
  daysWithNothingDue,
  gradeReview,
  openEarlySession,
  openOrResumeSession,
  pendingReviews,
  tonightsQueue,
} from './reviews'
import { dayKeyOf } from '../lib/day'

const DAY0 = new Date(2026, 7, 18, 8, 0)
const at = (n: number) => new Date(DAY0.getTime() + n * 86_400_000)
const key = (n: number) => dayKeyOf(at(n))

async function reset() {
  await db.delete()
  await db.open()
  await ensureSettings()
  await seedLibrary()
}

beforeEach(reset)

async function writeNote(body = 'an idea', dayOffset = 0) {
  const book = (await allBooks())[0]!
  const r = await logChapter({
    bookId: book.id,
    chapterLabel: 'Ch 1',
    position: 10,
    body,
    now: at(dayOffset).getTime(),
  })
  return r.note
}

async function pendingFor(noteId: string) {
  return (await db.reviews.toArray()).filter((r) => r.noteId === noteId && r.pending === 1)
}

describe('a note is born with exactly one pending review', () => {
  it('due tomorrow, at the bottom of the ladder', async () => {
    const note = await writeNote()
    const pending = await pendingFor(note.id)
    expect(pending).toHaveLength(1)
    expect(pending[0]!.dueDate).toBe(key(1))
    expect(pending[0]!.intervalIndex).toBe(0)
  })

  it('is never due the night it was written', async () => {
    await writeNote()
    expect((await tonightsQueue(key(0), 5)).nothingDue).toBe(true)
  })

  it('is written in the same transaction as the note', async () => {
    const book = (await allBooks())[0]!
    await expect(
      logChapter({ bookId: book.id, chapterLabel: 'x', position: 1, body: '   ' }),
    ).rejects.toThrow()
    expect(await db.reviews.count()).toBe(0)
  })
})

describe('grading', () => {
  it('closes the open row and opens exactly one new one', async () => {
    const note = await writeNote()
    const open = (await pendingFor(note.id))[0]!

    const outcome = await gradeReview(open.id, 'got_it', key(1), at(1).getTime())
    expect(outcome?.next.intervalIndex).toBe(1)

    const rows = (await db.reviews.toArray()).filter((r) => r.noteId === note.id)
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.pending === 1)).toHaveLength(1)

    const closed = rows.find((r) => r.pending === 0)!
    expect(closed.result).toBe('got_it')
    expect(closed.reviewedAt).toBe(at(1).getTime())

    const next = rows.find((r) => r.pending === 1)!
    expect(next.dueDate).toBe(key(4))
  })

  it('is REPLAY SAFE — grading the same row twice does not advance twice', async () => {
    const note = await writeNote()
    const open = (await pendingFor(note.id))[0]!

    const first = await gradeReview(open.id, 'got_it', key(1), at(1).getTime())
    const replay = await gradeReview(open.id, 'got_it', key(1), at(1).getTime())

    expect(first).not.toBeNull()
    expect(replay).toBeNull()

    const pending = await pendingFor(note.id)
    expect(pending).toHaveLength(1)
    expect(pending[0]!.intervalIndex).toBe(1) // not 2
  })

  it('two grades racing produce one advance and one no-op', async () => {
    const note = await writeNote()
    const open = (await pendingFor(note.id))[0]!
    const [a, b] = await Promise.all([
      gradeReview(open.id, 'got_it', key(1), at(1).getTime()),
      gradeReview(open.id, 'got_it', key(1), at(1).getTime()),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(await pendingFor(note.id)).toHaveLength(1)
  })

  it('missing a note five times never leaves more than one pending review', async () => {
    const note = await writeNote()
    for (let day = 1; day <= 5; day++) {
      const open = (await pendingFor(note.id))[0]!
      expect(open.dueDate).toBe(key(day))
      await gradeReview(open.id, 'missed', key(day), at(day).getTime())
      expect(await pendingFor(note.id)).toHaveLength(1)
    }
    const final = (await pendingFor(note.id))[0]!
    expect(final.intervalIndex).toBe(0)
    expect(final.dueDate).toBe(key(6))
  })

  it('grading strictly reduces tonight’s due count by exactly one', async () => {
    // The precise statement of "doesn't spiral": no grade can add work to today.
    const books = await allBooks()
    for (let i = 0; i < 4; i++) {
      await logChapter({
        bookId: books[i]!.id,
        chapterLabel: `Ch ${i}`,
        position: 5,
        body: `idea ${i}`,
        now: at(0).getTime(),
      })
    }
    const today = key(1)
    for (const grade of ['got_it', 'partial', 'missed', 'got_it'] as const) {
      const before = (await tonightsQueue(today, 50)).dueCount
      const open = (await pendingReviews()).filter((r) => r.dueDate <= today)[0]!
      await gradeReview(open.id, grade, today, at(1).getTime())
      const after = (await tonightsQueue(today, 50)).dueCount
      expect(after).toBe(before - 1)
    }
    expect((await tonightsQueue(today, 50)).nothingDue).toBe(true)
  })

  it('walks the full ladder to 55 days out through the database', async () => {
    const note = await writeNote()
    const dueDays: string[] = []
    let open = (await pendingFor(note.id))[0]!
    dueDays.push(open.dueDate)

    for (let i = 0; i < 4; i++) {
      const reviewedOn = open.dueDate
      await gradeReview(open.id, 'got_it', reviewedOn, Date.now())
      open = (await pendingFor(note.id))[0]!
      dueDays.push(open.dueDate)
    }
    expect(dueDays).toEqual([key(1), key(4), key(11), key(25), key(55)])
  })

  it('reviewing nine days late schedules from the review date, not the due date', async () => {
    const note = await writeNote()
    const open = (await pendingFor(note.id))[0]!
    expect(open.dueDate).toBe(key(1))
    await gradeReview(open.id, 'got_it', key(10), at(10).getTime())
    expect((await pendingFor(note.id))[0]!.dueDate).toBe(key(13))
  })

  it('returns null for a review that does not exist', async () => {
    expect(await gradeReview('rv_nope', 'got_it', key(1))).toBeNull()
  })
})

describe('the night session survives being killed', () => {
  it('resumes the same session with the same frozen queue', async () => {
    const books = await allBooks()
    for (let i = 0; i < 8; i++) {
      await logChapter({
        bookId: books[i]!.id,
        chapterLabel: `Ch ${i}`,
        position: 5,
        body: `idea ${i}`,
        now: at(0).getTime(),
      })
    }
    const first = await openOrResumeSession(key(1), 5, at(1).getTime())
    expect(first.reviewIds).toHaveLength(5)
    expect(first.heldBack).toBe(3)

    const resumed = await openOrResumeSession(key(1), 5, at(1).getTime())
    expect(resumed.id).toBe(first.id)
    expect(resumed.reviewIds).toEqual(first.reviewIds)
    expect(await db.sessions.count()).toBe(1)
  })

  it('a closed session is not resumed — the next one picks up what is left', async () => {
    const books = await allBooks()
    for (let i = 0; i < 3; i++) {
      await logChapter({
        bookId: books[i]!.id,
        chapterLabel: `Ch ${i}`,
        position: 5,
        body: `idea ${i}`,
        now: at(0).getTime(),
      })
    }
    const s = await openOrResumeSession(key(1), 5, at(1).getTime())
    await gradeReview(s.reviewIds[0]!, 'got_it', key(1))
    await db.sessions.update(s.id, { graded: 1 })
    await closeSession(s.id, at(1).getTime())

    const next = await openOrResumeSession(key(1), 5, at(1).getTime())
    expect(next.id).not.toBe(s.id)
    expect(next.reviewIds).toHaveLength(2)
  })

  it('an untouched session is discarded so it cannot claim a streak night', async () => {
    await writeNote()
    const s = await openOrResumeSession(key(1), 5, at(1).getTime())
    await abandonSession(s.id)
    expect(await db.sessions.count()).toBe(0)
  })

  it('a session with work in it is closed, not discarded', async () => {
    await writeNote()
    const s = await openOrResumeSession(key(1), 5, at(1).getTime())
    await db.sessions.update(s.id, { graded: 1 })
    await abandonSession(s.id)
    const stored = await db.sessions.get(s.id)
    expect(stored?.endedAt).not.toBeNull()
  })
})

describe('reviewing early', () => {
  it('pulls forward the soonest notes when nothing is due', async () => {
    await writeNote('idea')
    expect((await tonightsQueue(key(0), 5)).nothingDue).toBe(true)
    const s = await openEarlySession(key(0), 5, at(0).getTime())
    expect(s.reviewIds).toHaveLength(1)
  })
})

describe('daysWithNothingDue', () => {
  it('finds the nights the scheduler had nothing to give', async () => {
    // One note written on day 0 is due on day 1 and nothing else exists.
    const note = await writeNote()
    const open = (await pendingFor(note.id))[0]!
    await gradeReview(open.id, 'got_it', key(1), at(1).getTime()) // next due day 4

    const exempt = await daysWithNothingDue(key(0), key(3))
    expect(exempt).toContain(key(0)) // nothing due before it existed
    expect(exempt).toContain(key(2)) // graded on day 1, next due day 4
    expect(exempt).toContain(key(3))
    expect(exempt).not.toContain(key(1)) // it was due, and reviewed, on day 1
  })

  it('returns nothing when there are no reviews at all', async () => {
    expect(await daysWithNothingDue(key(0), key(5))).toEqual([])
  })

  it('a note left ungraded keeps every following night non-exempt', async () => {
    await writeNote()
    const exempt = await daysWithNothingDue(key(1), key(9))
    expect(exempt).toEqual([])
  })
})

describe('deleting a book takes its reviews with it', () => {
  it('leaves no orphaned review rows', async () => {
    const book = (await allBooks())[0]!
    await logChapter({ bookId: book.id, chapterLabel: 'a', position: 1, body: 'one' })
    await logChapter({ bookId: book.id, chapterLabel: 'b', position: 2, body: 'two' })
    expect(await db.reviews.count()).toBe(2)

    const counts = await deleteBook(book.id)
    expect(counts).toEqual({ logs: 2, notes: 2, reviews: 2 })
    expect(await db.reviews.count()).toBe(0)
  })
})

describe('the one-pending invariant holds under arbitrary use', () => {
  it('never drifts across a hundred mixed grades', async () => {
    const books = await allBooks()
    const notes = []
    for (let i = 0; i < 6; i++) {
      const r = await logChapter({
        bookId: books[i]!.id,
        chapterLabel: `Ch ${i}`,
        position: 5,
        body: `idea ${i}`,
        now: at(0).getTime(),
      })
      notes.push(r.note)
    }

    const grades = ['got_it', 'partial', 'missed'] as const
    for (let step = 0; step < 100; step++) {
      const day = key(1 + (step % 40))
      const due = (await pendingReviews()).filter((r) => r.dueDate <= day)
      if (due.length === 0) continue
      const pick = due[step % due.length]!
      await gradeReview(pick.id, grades[step % 3]!, day, Date.now())

      for (const note of notes) {
        expect(await pendingFor(note.id)).toHaveLength(1)
      }
    }
  })
})
