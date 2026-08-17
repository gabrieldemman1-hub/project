import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Screen } from '../../components/Screen'
import { getTodayView, type TodayView } from '../../db/queries'
import { skipToday, startSession, undoSkip } from '../../db/mutations'
import { formatLongDate } from '../../lib/date'
import { navigate } from '../../lib/router'
import { useToday } from '../../lib/useToday'

/**
 * Home / Today (BRIEF.md Part 6).
 *
 * Everything on this screen is read live from the database — change a template
 * in Settings and this re-renders without a reload.
 */
export function HomeScreen() {
  const date = useToday()
  const view = useLiveQuery(() => getTodayView(date), [date])

  // First paint before IndexedDB answers. Deliberately blank rather than a
  // spinner: the read resolves in single-digit milliseconds, and a spinner that
  // flashes for one frame is worse than nothing.
  if (!view) return <Screen>{null}</Screen>

  return view.template ? <TrainingDay view={view} /> : <RestDay view={view} />
}

function TrainingDay({ view }: { view: TodayView }) {
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
        completed ? (
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
      <Header date={date} position={position} />

      <div className="mt-8 flex items-baseline gap-4">
        <span className="num text-5xl font-bold text-accent">{template.letter}</span>
        <span className="text-lg text-text">{template.name}</span>
      </div>

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

      <Streak streak={streak} />
    </Screen>
  )
}

function RestDay({ view }: { view: TodayView }) {
  const { nextTemplate, unfinishedSession } = view

  return (
    <Screen
      action={
        unfinishedSession ? (
          <Button onClick={() => navigate('/session')}>
            Finish previous session
          </Button>
        ) : undefined
      }
    >
      <Header date={view.date} position={view.position} />

      {/* Centred in the space rather than stranded at the top — a rest day
          should look composed, not like a screen that failed to load. */}
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-2xl text-text">Rest day</p>
        <p className="mt-4 max-w-measure-base text-sm leading-relaxed text-text-secondary">
          Nothing scheduled today.
        </p>

        {nextTemplate ? (
          <div className="mt-10 flex items-baseline gap-4">
            <span className="num text-3xl font-bold text-text-muted">
              {nextTemplate.letter}
            </span>
            <div>
              <p className="text-xs tracking-wider text-text-secondary uppercase">
                Tomorrow
              </p>
              <p className="mt-1 text-base text-text">{nextTemplate.name}</p>
            </div>
          </div>
        ) : null}
      </div>

      <Streak streak={view.streak} />
    </Screen>
  )
}

function Header({
  date,
  position,
}: {
  date: string
  position: TodayView['position']
}) {
  return (
    <header className="flex items-baseline justify-between gap-4">
      <p className="text-xs tracking-wider text-text-secondary uppercase">
        {formatLongDate(date)}
      </p>
      {position ? (
        <p className="shrink-0 text-xs tracking-wider text-text-secondary uppercase">
          {position.isComplete ? (
            'Block complete'
          ) : (
            <>
              Week <span className="num text-text">{position.weekNumber}</span> of{' '}
              <span className="num text-text">{position.totalWeeks}</span>
              {position.isDeloadWeek ? ' · Deload' : ''}
            </>
          )}
        </p>
      ) : null}
    </header>
  )
}

function Streak({ streak }: { streak: number }) {
  return (
    <p className="mt-10 text-xs tracking-wider text-text-secondary uppercase">
      {streak === 0 ? (
        'No streak yet'
      ) : (
        <>
          <span className="num text-text">{streak}</span> day streak
        </>
      )}
    </p>
  )
}
