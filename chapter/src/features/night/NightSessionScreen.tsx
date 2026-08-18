import { useEffect, useRef, useState } from 'react'
import { Screen } from '../../components/Screen'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { RecallCard } from './RecallCard'
import { GradeBar } from './GradeBar'
import { SessionSummary } from './SessionSummary'
import { AiCheck } from './AiCheck'
import {
  abandonSession,
  closeSession,
  daysWithNothingDue,
  markRevealed,
  openEarlySession,
  openOrResumeSession,
  recordGrade,
  settleOpenSessions,
  tonightsQueue,
} from '../../db/reviews'
import { hydrateSession, type RecallItem } from '../../db/nightSession'
import { getSettings, reviewSessionDays } from '../../db/queries'
import { reviewStreak } from '../../lib/streaks'
import { addDays, todayKey } from '../../lib/day'
import { hrefFor } from '../../lib/router'
import { NO_SERVER, serverFeatures, type ServerFeatures } from '../../lib/api'
import type { Grade } from '../../lib/scheduler'

type Phase = 'loading' | 'nothing-due' | 'cap-reached' | 'recalling' | 'summary'

const FLASH_MS = 700

export function NightSessionScreen() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [items, setItems] = useState<RecallItem[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [graded, setGraded] = useState(0)
  const [heldBack, setHeldBack] = useState(0)
  const [dueCount, setDueCount] = useState(0)
  const [streak, setStreak] = useState(0)
  const [features, setFeatures] = useState<ServerFeatures>(NO_SERVER)

  // Leaving the screen must never strand an open session. A hash change fires
  // neither pagehide nor visibilitychange, so the unmount cleanup is what
  // actually banks a night the user earned by tapping "Home" after two grades.
  const liveSession = useRef<string | null>(null)
  const finished = useRef(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void serverFeatures().then(setFeatures)
  }, [])

  useEffect(() => {
    void (async () => {
      const today = todayKey(new Date())
      const settings = await getSettings()
      const cap = settings?.reviewCap ?? 5

      // Anything left open on a previous day is settled before we look at tonight.
      await settleOpenSessions(addDays(today, -1))

      const queue = await tonightsQueue(today, cap)

      if (queue.nothingDue || queue.capReached) {
        // Nothing more will be served, so bank whatever was done tonight
        // instead of leaving a session open and uncounted.
        await settleOpenSessions(today)
        setDueCount(queue.dueCount)
        setHeldBack(queue.heldBack)
        setGraded(queue.alreadyDone)
        setPhase(queue.nothingDue ? 'nothing-due' : 'cap-reached')
        return
      }

      const session = await openOrResumeSession(today, cap)
      const hydrated = await hydrateSession(session, today, cap)

      liveSession.current = session.id
      setSessionId(session.id)
      setItems(hydrated.items)
      setGraded(session.graded)
      setHeldBack(hydrated.heldBack)
      setDueCount(hydrated.dueCount)
      setRevealed(hydrated.revealed)

      if (hydrated.items.length === 0) {
        await finish(session.id, session.graded)
      } else {
        setPhase('recalling')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
      const id = liveSession.current
      if (id && !finished.current) void abandonSession(id)
    },
    [],
  )

  // Backgrounding is the other way out, and the one iOS takes most often.
  useEffect(() => {
    if (!sessionId || phase !== 'recalling') return
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && graded > 0) void closeSession(sessionId)
    }
    window.addEventListener('pagehide', onHidden)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', onHidden)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [sessionId, phase, graded])

  async function finish(id: string, gradedCount: number) {
    finished.current = true
    liveSession.current = null
    if (gradedCount > 0) await closeSession(id)
    else await abandonSession(id)

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
    if (!sessionId || !item || busy) return
    setBusy(true)
    try {
      // One transaction: the grade and the session's progress move together.
      const outcome = await recordGrade(sessionId, item.reviewId, g)
      if (!outcome) return // a replay — already graded, nothing to advance

      setGraded(outcome.graded)
      setFlash(outcome.next.sentence)

      // Clear the revealed state NOW, before any await, so the grade bar cannot
      // be reached a second time for a note that has already been graded.
      setRevealed(false)
      const nextIndex = index + 1
      setIndex(nextIndex)

      flashTimer.current = setTimeout(() => {
        setFlash(null)
        if (nextIndex >= items.length) void finish(sessionId, outcome.graded)
      }, FLASH_MS)
    } finally {
      setBusy(false)
    }
  }

  async function reveal() {
    const item = items[index]
    if (!item) return
    setRevealed(true)
    if (sessionId) await markRevealed(sessionId, item.reviewId)
  }

  async function startEarly() {
    const today = todayKey(new Date())
    const settings = await getSettings()
    const cap = settings?.reviewCap ?? 5
    const session = await openEarlySession(today, cap)
    const hydrated = await hydrateSession(session, today, cap)
    if (hydrated.items.length === 0) {
      await abandonSession(session.id)
      return
    }
    finished.current = false
    liveSession.current = session.id
    setSessionId(session.id)
    setItems(hydrated.items)
    setGraded(0)
    setHeldBack(0)
    setDueCount(hydrated.items.length)
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
            <div className="space-y-2">
              {features.grade && (
                <AiCheck key={item.reviewId} noteBody={item.body} onAccept={grade} />
              )}
              <GradeBar onGrade={grade} busy={busy} />
            </div>
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
      <RecallCard item={item} revealed={revealed} onReveal={reveal} />
    </Screen>
  )
}
