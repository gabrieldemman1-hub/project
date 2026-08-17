import { useLiveQuery } from 'dexie-react-hooks'

import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Screen } from '../../components/Screen'
import { getTodayView, type TodayView } from '../../db/queries'
import { formatLongDate } from '../../lib/date'
import { today } from '../../lib/schedule'

/**
 * Home / Today (BRIEF.md Part 6).
 *
 * Everything on this screen is read live from the database — change a template
 * in Settings and this re-renders without a reload.
 */
export function HomeScreen() {
  const date = today()
  const view = useLiveQuery(() => getTodayView(date), [date])

  // First paint before IndexedDB answers. Deliberately blank rather than a
  // spinner: the read resolves in single-digit milliseconds, and a spinner that
  // flashes for one frame is worse than nothing.
  if (!view) return <Screen>{null}</Screen>

  return view.template ? <TrainingDay view={view} /> : <RestDay view={view} />
}

function TrainingDay({ view }: { view: TodayView }) {
  const { template, exercises, position, streak, date } = view
  if (!template) return null

  return (
    <Screen
      action={
        // Wired up in Phase 2. Disabled rather than absent so the screen is
        // composed against its real primary action.
        <>
          <Button disabled>Start session</Button>
          <p className="mt-4 text-center text-xs tracking-wider text-text-muted uppercase">
            Logging arrives next phase
          </p>
        </>
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
        45 min incline walk to finish
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
                  {exercise.muscleGroup}
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
  const { nextTemplate } = view

  return (
    <Screen>
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
