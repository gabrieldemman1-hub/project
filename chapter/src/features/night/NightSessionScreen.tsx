import { useCallback, useEffect, useState } from 'react'
import { Screen } from '../../components/Screen'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { RecallCard } from './RecallCard'
import { GradeBar } from './GradeBar'
import { SessionSummary } from './SessionSummary'
import { db } from '../../db/db'
import {
  abandonSession,
  closeSession,
  daysWithNothingDue,
  gradeReview,
  notesByIds,
  openEarlySession,
  openOrResumeSession,
  reviewsByIds,
  tonightsQueue,
} from '../../db/reviews'
import { getSettings, reviewSessionDays } from '../../db/queries'
import { reviewStreak } from '../../lib/streaks'
import { addDays, todayKey } from '../../lib/day'
import { hrefFor } from '../../lib/router'
import type { Grade } from '../../lib/scheduler'
import type { Note, ReviewSession } from '../../db/schema'

interface Item {
  reviewId: string
  note: Note
  bookTitle: string
}

type Phase = 'loading' | 'nothing-due' | 'cap-reached' | 'recalling' | 'summary'

export function NightSessionScreen() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [graded, setGraded] = useState(0)
  const [heldBack, setHeldBack] = useState(0)
  const [dueCount, setDueCount] = useState(0)
  const [streak, setStreak] = useState(0)

  /** Resolves a session's frozen review ids into cards, skipping any already graded. */
  const hydrate = useCallback(async (s: ReviewSession) => {
    const reviews = await reviewsByIds(s.reviewIds)
    const stillPending = s.reviewIds
      .map((id) => reviews.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined && r.pending === 1)

    const notes = await notesByIds(stillPending.map((r) => r.noteId))
    const books = await db.books.toArray()
    const titleOf = new Map(books.map((b) => [b.id, b.title]))

    const resolved: Item[] = []
    for (const r of stillPending) {
      const note = notes.get(r.noteId)
      if (!note) continue // the book was deleted out from under it
      resolved.push({ reviewId: r.id, note, bookTitle: titleOf.get(note.bookId) ?? 'A book' })
    }
    return resolved
  }, [])

  useEffect(() => {
    void (async () => {
      const today = todayKey(new Date())
      const settings = await getSettings()
      const cap = settings?.reviewCap ?? 5

      const queue = await tonightsQueue(today, cap)
      if (queue.nothingDue) {
        setPhase('nothing-due')
        return
      }
      if (queue.capReached) {
        setDueCount(queue.dueCount)
        setHeldBack(queue.heldBack)
        setGraded(queue.alreadyDone)
        setPhase('cap-reached')
        return
      }

      const s = await openOrResumeSession(today, cap)
      const resolved = await hydrate(s)
      setSession(s)
      setItems(resolved)
      setGraded(s.graded)
      setHeldBack(s.heldBack)
      setDueCount(s.dueCount)
      // A revealed card stays revealed across a relaunch — being re-hidden
      // mid-thought would be worse than seeing it a second time.
      setRevealed(s.revealed && resolved.length > 0)
      setPhase(resolved.length === 0 ? 'summary' : 'recalling')
      if (resolved.length === 0) await finish(s, s.graded)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Bank the night if any work was done; discard an untouched session. */
  useEffect(() => {
    if (!session || phase !== 'recalling') return
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return
      if (graded > 0) void closeSession(session.id)
    }
    window.addEventListener('pagehide', onHidden)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', onHidden)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [session, phase, graded])

  async function finish(s: ReviewSession, gradedCount: number) {
    if (gradedCount > 0) {
      await closeSession(s.id)
    } else {
      await abandonSession(s.id)
    }
    const today = todayKey(new Date())
    const [sessionDays, exempt] = await Promise.all([
      reviewSessionDays(),
      daysWithNothingDue(addDays(today, -120), today),
    ])
    setStreak(reviewStreak(sessionDays, today, exempt).current)
    setPhase('summary')
  }

  async function grade(g: Grade) {
    const item = items[index]
    if (!session || !item || busy) return
    setBusy(true)

    const outcome = await gradeReview(item.reviewId, g, todayKey(new Date()))
    const nextGraded = graded + 1
    setGraded(nextGraded)
    await db.sessions.update(session.id, {
      graded: nextGraded,
      currentIndex: index + 1,
      revealed: false,
      updatedAt: Date.now(),
    })

    setFlash(outcome?.next.sentence ?? null)
    setBusy(false)

    window.setTimeout(() => {
      setFlash(null)
      const nextIndex = index + 1
      if (nextIndex >= items.length) {
        void finish(session, nextGraded)
      } else {
        setIndex(nextIndex)
        setRevealed(false)
      }
    }, 700)
  }

  async function reveal() {
    setRevealed(true)
    if (session) {
      await db.sessions.update(session.id, { revealed: true, updatedAt: Date.now() })
    }
  }

  async function startEarly() {
    const today = todayKey(new Date())
    const settings = await getSettings()
    const s = await openEarlySession(today, settings?.reviewCap ?? 5)
    const resolved = await hydrate(s)
    if (resolved.length === 0) {
      await abandonSession(s.id)
      return
    }
    setSession(s)
    setItems(resolved)
    setGraded(0)
    setHeldBack(0)
    setDueCount(resolved.length)
    setIndex(0)
    setRevealed(false)
    setPhase('recalling')
  }

  if (phase === 'loading') return <Screen>{null}</Screen>

  if (phase === 'nothing-due') {
    return (
      <Screen title="Tonight" back={{ label: 'Home', href: hrefFor({ name: 'home' }) }}>
        <EmptyState
          title="Nothing due tonight."
          body="Everything you've written is where it should be. The next notes come back when they're nearly forgotten."
          action={
            <Button variant="secondary" onClick={startEarly}>
              Review something early
            </Button>
          }
        />
      </Screen>
    )
  }

  if (phase === 'cap-reached') {
    return (
      <Screen title="Tonight" back={{ label: 'Home', href: hrefFor({ name: 'home' }) }}>
        <EmptyState
          title="That's tonight's five."
          body={`${heldBack} more ${heldBack === 1 ? 'note is' : 'notes are'} waiting, and they keep until tomorrow. Nothing was marked missed — stopping here is the point of the cap.`}
        />
      </Screen>
    )
  }

  if (phase === 'summary') {
    return (
      <Screen title="Tonight" back={{ label: 'Home', href: hrefFor({ name: 'home' }) }}>
        {null}
        <SessionSummary
          graded={graded}
          heldBack={heldBack}
          reviewStreak={streak}
          onDone={() => undefined}
        />
      </Screen>
    )
  }

  const item = items[index]
  if (!item) return <Screen>{null}</Screen>

  return (
    <Screen
      fill
      back={{ label: 'Home', href: hrefFor({ name: 'home' }) }}
      action={
        <span className="text-sm text-ink-quiet tnum">
          {index + 1} of {items.length}
        </span>
      }
      footer={
        <div>
          {flash ? (
            <p className="text-center text-sm text-accent-ink py-5 min-h-[3.75rem] flex items-center justify-center">
              {flash}
            </p>
          ) : revealed ? (
            <GradeBar onGrade={grade} busy={busy} />
          ) : (
            <p className="text-center text-xs text-ink-faint py-5 min-h-[3.75rem] flex items-center justify-center">
              Recall first. Grading opens after you reveal.
            </p>
          )}
          {heldBack > 0 && (
            <p className="text-center text-xs text-ink-faint mt-3">
              {items.length} of {dueCount} tonight. The rest keep — nothing was marked missed.
            </p>
          )}
        </div>
      }
    >
      <RecallCard
        note={item.note}
        bookTitle={item.bookTitle}
        revealed={revealed}
        onReveal={reveal}
      />
    </Screen>
  )
}
