import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Screen } from '../../components/Screen'
import { getTodayView, type TodayView } from '../../db/queries'
import {
  skipToday,
  startNewMesocycle,
  startSession,
  undoSkip,
} from '../../db/mutations'
import { WEEKDAY_NAMES, addDays, formatLongDate, weekdayOf } from '../../lib/date'
import { navigate } from '../../lib/router'
import { useToday } from '../../lib/useToday'
import { APP_VERSION } from '../../lib/version'

/**
 * Home / Today (BRIEF.md Part 6), extended with day browsing: chevrons or a
 * horizontal swipe step through the calendar in both directions, so any day's
 * plan can be looked at from any other day.
 *
 * Browsing is strictly read-only. Start, Resume and Skip exist only on the
 * real today — a browsed date offers nothing but "Back to today" — so looking
 * at Thursday can never accidentally create Thursday's session on a Tuesday.
 */
export function HomeScreen() {
  const today = useToday()
  /** Days away from today; 0 is home. Kept relative so midnight re-anchors. */
  const [offset, setOffset] = useState(0)
  const date = addDays(today, offset)
  const isToday = offset === 0

  const view = useLiveQuery(() => getTodayView(date), [date])

  // Horizontal swipe steps days; a mostly-vertical drag is list scrolling and
  // must never change the day.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onTouchStart(event: React.TouchEvent) {
    const t = event.touches[0]
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    const end = event.changedTouches[0]
    if (!start || !end) return
    const dx = end.clientX - start.x
    const dy = end.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return
    setOffset(offset + (dx < 0 ? 1 : -1))
  }

  if (!view) return <Screen>{null}</Screen>

  const nav = { offset, isToday, setOffset }
  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="contents">
      {view.template ? (
        <TrainingDay view={view} today={today} nav={nav} />
      ) : (
        <RestDay view={view} nav={nav} />
      )}
    </div>
  )
}

interface DayNavState {
  offset: number
  isToday: boolean
  setOffset: (offset: number) => void
}

/**
 * The end of a six-week block waits for a deliberate tap (decision A-4): the
 * app never rolls into a new mesocycle on its own. Training is paused until
 * the new block is started.
 */
function StartNewBlock() {
  const [starting, setStarting] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs tracking-wider text-text-secondary uppercase">
        Six weeks done — deload finished
      </p>
      <Button
        disabled={starting}
        onClick={() => {
          setStarting(true)
          void startNewMesocycle().finally(() => setStarting(false))
        }}
      >
        Start new block
      </Button>
    </div>
  )
}

function DayNav({ nav }: { nav: DayNavState }) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => nav.setOffset(nav.offset - 1)}
        className="min-h-touch-min min-w-touch-min rounded-md border border-border bg-surface-raised text-base text-text-secondary active:bg-surface"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next day"
        onClick={() => nav.setOffset(nav.offset + 1)}
        className="min-h-touch-min min-w-touch-min rounded-md border border-border bg-surface-raised text-base text-text-secondary active:bg-surface"
      >
        ›
      </button>
      {/* Returning home lives in the action bar, in the thumb zone — one
          "Back to today", not two. */}
    </div>
  )
}

/** One line saying what became of a browsed day. Today speaks through the
 * action area instead, and the future needs no verdict. */
function DayStatus({ view, today }: { view: TodayView; today: string }) {
  if (view.date >= today) return null

  const { session } = view
  const verdict =
    session?.status === 'completed' ? (
      <>
        Completed
        <span className="mx-2 text-text-muted">·</span>
        <span className="num text-text">{view.setsLoggedToday}</span> sets
        {session.cardio ? (
          <>
            <span className="mx-2 text-text-muted">·</span>
            <span className="num text-text">{session.cardio.durationMin}</span> min
            cardio
          </>
        ) : null}
      </>
    ) : session?.status === 'skipped' ? (
      'Skipped'
    ) : session?.status === 'in_progress' ? (
      'Unfinished'
    ) : (
      'Not trained'
    )

  return (
    <p className="mt-3 text-xs tracking-wider text-text-secondary uppercase">
      {verdict}
    </p>
  )
}

function TrainingDay({
  view,
  today,
  nav,
}: {
  view: TodayView
  today: string
  nav: DayNavState
}) {
  const { template, exercises, position, streak, date, session, unfinishedSession } = view
  const [starting, setStarting] = useState(false)
  if (!template) return null

  const completed = session?.status === 'completed'
  const skipped = session?.status === 'skipped'
  const inProgress = session?.status === 'in_progress'
  // A workout left in progress on an earlier date takes precedence: finishing
  // it just navigates — starting today's would strand it forever.
  const resumingOld = !session && unfinishedSession !== undefined

  async function start() {
    if (starting) return
    if (resumingOld) {
      navigate('/session')
      return
    }
    setStarting(true)
    try {
      await startSession(date)
      navigate('/session')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Screen
      action={
        !nav.isToday ? (
          <Button variant="quiet" onClick={() => nav.setOffset(0)}>
            Back to today
          </Button>
        ) : resumingOld ? (
          // An unfinished workout outranks everything — even a completed
          // block. Without this ordering, week 7 arriving would hide the only
          // path to finishing Saturday's half-done deload session.
          <Button onClick={() => navigate('/session')}>
            Finish previous session
          </Button>
        ) : position?.isComplete && !session ? (
          <StartNewBlock />
        ) : completed ? (
          <p className="text-center text-xs tracking-wider text-text-secondary uppercase">
            Session complete
            <span className="mx-2 text-text-muted">·</span>
            <span className="num text-text">{view.setsLoggedToday}</span> sets
            {session?.cardio ? (
              <>
                <span className="mx-2 text-text-muted">·</span>
                <span className="num text-text">{session.cardio.durationMin}</span> min
                cardio
              </>
            ) : null}
          </p>
        ) : skipped ? (
          <div className="flex flex-col gap-3">
            <p className="text-center text-xs tracking-wider text-text-secondary uppercase">
              Skipped today
            </p>
            <button
              type="button"
              onClick={() => void undoSkip(date)}
              className="min-h-touch-min rounded-md border border-border bg-surface-raised text-sm text-text-secondary"
            >
              Undo skip
            </button>
          </div>
        ) : (
          <>
            <Button onClick={() => void start()} disabled={starting}>
              {inProgress
                ? 'Resume session'
                : resumingOld
                  ? 'Finish previous session'
                  : 'Start session'}
            </Button>
            {!inProgress && !resumingOld ? (
              <button
                type="button"
                onClick={() => void skipToday(date)}
                className="mt-3 min-h-touch-min w-full rounded-md text-xs tracking-wider text-text-muted uppercase"
              >
                Skip today
              </button>
            ) : null}
          </>
        )
      }
    >
      <Header
        date={date}
        position={position}
        isToday={nav.isToday}
        dayLetter={template.letter}
      />
      <DayNav nav={nav} />

      {/* The header already states WEEK n · DAY X, so this is the muscle
          groups alone rather than a second giant letter. */}
      <p className="mt-6 text-2xl leading-snug text-balance text-text">
        {template.name}
      </p>

      <DayStatus view={view} today={today} />

      <p className="mt-3 text-sm text-text-secondary">
        {exercises.length} exercises
        <span className="mx-2 text-text-muted">·</span>
        <span className="num">{view.cardioMinutes}</span> min incline walk to finish
      </p>

      <ul className="mt-8 flex flex-col gap-3">
        {exercises.map((exercise, index) => (
          <li key={exercise.id}>
            <Card className="flex items-start gap-4 px-5 py-4">
              <span className="num w-5 shrink-0 text-base text-text-muted">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                {/* Never truncated — the movement name is the content. */}
                <p className="text-base leading-snug text-balance text-text">
                  {exercise.name}
                </p>
                <p className="mt-2 text-xs tracking-wider text-text-secondary uppercase">
                  {exercise.muscleGroupName}
                  <span className="mx-2 text-text-muted">·</span>
                  {exercise.repTargetMin}–{exercise.repTargetMax} reps
                </p>
              </div>
              <span className="num shrink-0 text-sm text-text-muted">
                {exercise.restSeconds}s
              </span>
            </Card>
          </li>
        ))}
      </ul>

      {nav.isToday ? <Streak streak={streak} /> : null}
    </Screen>
  )
}

function RestDay({ view, nav }: { view: TodayView; nav: DayNavState }) {
  const { nextTemplate, unfinishedSession } = view
  const nextLabel = nav.isToday
    ? 'Tomorrow'
    : (WEEKDAY_NAMES[weekdayOf(addDays(view.date, 1))] ?? 'Next day')

  return (
    <Screen
      action={
        !nav.isToday ? (
          <Button variant="quiet" onClick={() => nav.setOffset(0)}>
            Back to today
          </Button>
        ) : unfinishedSession ? (
          // Ordered before the block-complete state — see TrainingDay.
          <Button onClick={() => navigate('/session')}>
            Finish previous session
          </Button>
        ) : view.position?.isComplete ? (
          <StartNewBlock />
        ) : undefined
      }
    >
      <Header date={view.date} position={view.position} isToday={nav.isToday} />
      <DayNav nav={nav} />

      {/* Centred in the space rather than stranded at the top — a rest day
          should look composed, not like a screen that failed to load. */}
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-2xl text-text">Rest day</p>
        <p className="mt-4 max-w-measure-base text-sm leading-relaxed text-text-secondary">
          Nothing scheduled{nav.isToday ? ' today' : ''}.
        </p>

        {nextTemplate ? (
          <div className="mt-10 flex items-baseline gap-4">
            <span className="num text-3xl font-bold text-text-muted">
              {nextTemplate.letter}
            </span>
            <div>
              <p className="text-xs tracking-wider text-text-secondary uppercase">
                {nextLabel}
              </p>
              <p className="mt-1 text-base text-text">{nextTemplate.name}</p>
            </div>
          </div>
        ) : null}
      </div>

      {nav.isToday ? <Streak streak={view.streak} /> : null}
    </Screen>
  )
}

/**
 * The day header, in the owner's reference style: a bold "WEEK n · DAY X"
 * line with the date beneath it, and the dashboard link where the reference
 * puts its icons. Part 7 keeps nothing important in the top corners, so the
 * corner holds only a labelled back link, never a primary action.
 */
function Header({
  date,
  position,
  isToday,
  dayLetter,
}: {
  date: string
  position: TodayView['position']
  isToday: boolean
  dayLetter?: string | undefined
}) {
  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <p className="text-lg font-bold tracking-wide text-text uppercase">
          {position && !position.isComplete ? (
            <>
              Week <span className="num">{position.weekNumber}</span>
              {dayLetter ? (
                <>
                  <span className="mx-2 text-text-muted">·</span>
                  <span className="text-text-secondary">Day </span>
                  <span className="num text-accent">{dayLetter}</span>
                </>
              ) : null}
            </>
          ) : (
            'Block complete'
          )}
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="min-h-touch-min shrink-0 rounded-md px-2 text-xs tracking-wider text-text-secondary uppercase"
        >
          ‹ Dashboard
        </button>
      </div>
      <p className="mt-1 text-xs tracking-wider text-text-secondary uppercase">
        {formatLongDate(date)}
        {isToday ? <span className="ml-2 text-text-muted">· Today</span> : null}
        {position?.isDeloadWeek ? (
          <span className="ml-2 text-accent">· Deload</span>
        ) : null}
      </p>
    </header>
  )
}

function Streak({ streak }: { streak: number }) {
  return (
    <div className="mt-10">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs tracking-wider text-text-secondary uppercase">
          {streak === 0 ? (
            'No streak yet'
          ) : (
            <>
              <span className="num text-text">{streak}</span> day streak
            </>
          )}
        </p>
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => navigate('/history')}
            className="min-h-touch-min rounded-md px-2 text-xs tracking-wider text-text-secondary uppercase"
          >
            History ›
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="min-h-touch-min rounded-md px-2 text-xs tracking-wider text-text-secondary uppercase"
          >
            Settings ›
          </button>
        </span>
      </div>
      <p className="mt-2 text-micro tracking-wider text-text-muted uppercase">
        {APP_VERSION}
      </p>
    </div>
  )
}
