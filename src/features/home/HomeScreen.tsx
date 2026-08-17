import { useEffect, useState } from 'react'
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
import {
  WEEKDAY_NAMES,
  addDays,
  daysBetween,
  formatLongDate,
  weekdayOf,
} from '../../lib/date'
import { clearRouteDay, navigate, routeDay } from '../../lib/router'
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
  /**
   * Days away from today; 0 is home. Kept relative so midnight re-anchors.
   * A day tapped on the dashboard's week board arrives as `?d=` and is
   * converted to an offset here — the state stays relative either way.
   */
  const [offset, setOffset] = useState(() => {
    const day = routeDay()
    return day ? daysBetween(today, day) : 0
  })
  // Spend the deep link after the first render (kept out of the initialiser,
  // which StrictMode runs twice).
  useEffect(clearRouteDay, [])
  const date = addDays(today, offset)
  const isToday = offset === 0

  const view = useLiveQuery(() => getTodayView(date), [date])

  if (!view) return <Screen>{null}</Screen>

  /*
   * Swipe-to-change-day is gone (owner request, from real use). A horizontal
   * swipe and a vertical scroll are the same gesture until the finger has
   * already moved, so resting a thumb on the screen could quietly change the
   * day you were reading. Every navigation in this app is now a deliberate tap
   * on a named control.
   */
  const nav = { offset, isToday, setOffset }
  return view.template ? (
    <TrainingDay view={view} today={today} nav={nav} />
  ) : (
    <RestDay view={view} nav={nav} />
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

/**
 * The day scrubber, sitting on the date line itself since that is what it
 * changes. It used to be its own row below the header, which cost 68px of a
 * phone screen — the reason a five-exercise day could not fit above the
 * action bar (owner report, from real use). Returning home lives in the
 * action bar, in the thumb zone — one "Back to today", not two.
 */
function DayNav({ nav }: { nav: DayNavState }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
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
    </span>
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
        <span className="mx-2 text-text-faint">·</span>
        <span className="num text-text">{view.setsLoggedToday}</span> sets
        {session.cardio ? (
          <>
            <span className="mx-2 text-text-faint">·</span>
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
  const { template, exercises, position, date, session, unfinishedSession } = view
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
            <span className="mx-2 text-text-faint">·</span>
            <span className="num text-text">{view.setsLoggedToday}</span> sets
            {session?.cardio ? (
              <>
                <span className="mx-2 text-text-faint">·</span>
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
          // Only the primary lives in the bar — "Skip today" sits under the
          // exercise list instead, buying the list ~56px of viewport, which
          // is what lets a whole day fit on an iPhone SE.
          <Button onClick={() => void start()} disabled={starting}>
            {inProgress
              ? 'Resume session'
              : resumingOld
                ? 'Finish previous session'
                : 'Start session'}
          </Button>
        )
      }
    >
      <Header
        date={date}
        position={position}
        isToday={nav.isToday}
        dayLetter={template.letter}
        nav={nav}
      />

      {/* The header already states WEEK n · DAY X, so this is the muscle
          groups alone rather than a second giant letter. */}
      <p className="mt-3 text-2xl leading-snug text-balance text-text">
        {template.name}
      </p>

      <DayStatus view={view} today={today} />

      {/* Short enough to stay on one line at 375px — a wrapped meta line is
          another row stolen from the exercise list below. */}
      <p className="mt-2 text-sm text-text-secondary">
        {exercises.length} exercises
        <span className="mx-2 text-text-faint">·</span>
        <span className="num">{view.cardioMinutes}</span> min walk after
      </p>

      {/*
       * One line per exercise, so the whole workout is visible at once. The
       * list is the *only* scroller in the app (owner request): it owns its
       * own overflow, so a long day scrolls the list while the header, the
       * counts and the action bar stay exactly where they are. At the seeded
       * 4–5 exercises nothing scrolls at all.
       *
       * min-h-0 is load-bearing on a flex child that scrolls — without it the
       * list grows to fit its content and pushes the screen instead.
       */}
      <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
        {exercises.map((exercise, index) => (
          <li key={exercise.id} className="shrink-0">
            <Card className="flex items-center gap-4 px-4 py-2">
              <span className="num w-5 shrink-0 text-sm text-text-muted">
                {index + 1}
              </span>
              <p className="min-w-0 flex-1 text-base leading-snug text-balance text-text">
                {exercise.name}
              </p>
              <span className="num shrink-0 text-sm text-text-secondary">
                {exercise.repTargetMin}–{exercise.repTargetMax}
              </span>
            </Card>
          </li>
        ))}
      </ul>

      {/* The ready state's secondary action. Same reachability as the Start
          button's else-branch above: today, nothing started or unfinished,
          block still running. */}
      {nav.isToday && !session && !unfinishedSession && !position?.isComplete ? (
        <button
          type="button"
          onClick={() => void skipToday(date)}
          className="mt-3 min-h-touch-min w-full shrink-0 rounded-md text-xs tracking-wider text-text-muted uppercase"
        >
          Skip today
        </button>
      ) : null}

      {/* No streak or History/Settings row here any more: the dashboard is one
          tap away and carries all three pinned in its own footer. Repeating
          them cost this screen ~70px it needs for the workout. */}
      {nav.isToday ? <VersionStamp /> : null}
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
      <Header date={view.date} position={view.position} isToday={nav.isToday} nav={nav} />

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

      {nav.isToday ? <VersionStamp /> : null}
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
  nav,
}: {
  date: string
  position: TodayView['position']
  isToday: boolean
  dayLetter?: string | undefined
  nav: DayNavState
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
                  <span className="mx-2 text-text-faint">·</span>
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
      <div className="mt-1 flex items-center justify-between gap-4">
        <p className="text-xs tracking-wider text-text-secondary uppercase">
          {formatLongDate(date)}
          {isToday ? <span className="ml-2 text-text-muted">· Today</span> : null}
          {position?.isDeloadWeek ? (
            <span className="ml-2 text-accent">· Deload</span>
          ) : null}
        </p>
        <DayNav nav={nav} />
      </div>
    </header>
  )
}

/**
 * Which build the phone is running. Kept on this screen (and in Settings) so
 * a cached page and a fresh deploy can be told apart at a glance — the reason
 * it has existed since Phase 1.
 */
function VersionStamp() {
  return (
    <p className="mt-3 shrink-0 text-micro tracking-wider text-text-muted uppercase">
      {APP_VERSION}
    </p>
  )
}
