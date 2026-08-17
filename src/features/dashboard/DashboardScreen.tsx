import { useLiveQuery } from 'dexie-react-hooks'

import { Screen } from '../../components/Screen'
import { getDashboardView, type DashboardBlock, type TodayState } from '../../db/queries'
import { formatLongDate, fromIsoDate } from '../../lib/date'
import { navigate } from '../../lib/router'
import { useToday } from '../../lib/useToday'
import { APP_VERSION } from '../../lib/version'

/**
 * The dashboard — what opens when the app opens (product owner request).
 *
 * It greets, states today's training day from the live mesocycle, and hands
 * off: tapping the block card is the single deliberate step into the workout.
 * Everything that used to be the opening screen now lives behind that tap on
 * /today, so the front door is an orientation surface, not a control panel.
 */
export function DashboardScreen() {
  const date = useToday()
  const view = useLiveQuery(() => getDashboardView(date), [date])

  if (!view) return <Screen>{null}</Screen>

  const { activeBlock } = view

  return (
    <Screen>
      <header>
        <p className="text-xs tracking-wider text-text-secondary uppercase">
          {greeting()}
        </p>
        <h1 className="mt-2 text-2xl leading-snug text-text">
          {formatLongDate(view.date)}
        </h1>
      </header>

      {activeBlock ? (
        <BlockCard block={activeBlock} view={view} />
      ) : (
        <p className="mt-8 text-sm text-text-secondary">Setting up your program…</p>
      )}

      {view.savedBlocks.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xs tracking-wider text-text-secondary uppercase">
            Saved blocks
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {view.savedBlocks.map((block) => (
              <li
                key={block.id}
                className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3"
              >
                <span className="text-sm text-text-secondary">
                  {monthAndYear(block.startDate)}
                </span>
                <span className="shrink-0 text-micro tracking-wider text-text-muted uppercase">
                  <span className="num">{block.sessionCount}</span> sessions
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-auto pt-10">
        <p className="text-xs tracking-wider text-text-secondary uppercase">
          {view.streak === 0 ? (
            'No streak yet'
          ) : (
            <>
              <span className="num text-text">{view.streak}</span> day streak
            </>
          )}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/history')}
            className="min-h-touch-min flex-1 rounded-md border border-border bg-surface text-xs tracking-wider text-text-secondary uppercase"
          >
            History
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="min-h-touch-min flex-1 rounded-md border border-border bg-surface text-xs tracking-wider text-text-secondary uppercase"
          >
            Settings
          </button>
        </div>
        <p className="mt-3 text-micro tracking-wider text-text-muted uppercase">
          {APP_VERSION}
        </p>
      </div>
    </Screen>
  )
}

/**
 * The one tappable thing: the live mesocycle, stating the day and its state.
 * It carries the screen's only glow, so where to go is never ambiguous.
 */
function BlockCard({
  block,
  view,
}: {
  block: DashboardBlock
  view: { dayLetter: string | null; dayName: string | null; exerciseCount: number; state: TodayState; setsLoggedToday: number; nextDayLetter: string | null; nextDayName: string | null }
}) {
  const rest = view.state === 'rest'
  return (
    <button
      type="button"
      aria-label="Open today’s workout"
      onClick={() => navigate('/today')}
      className="mt-8 w-full rounded-xl border border-accent-border bg-surface px-5 py-5 text-left shadow-soft active:scale-[0.995]"
      style={{ transitionDuration: 'var(--duration-fast)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs tracking-wider text-text-secondary uppercase">
          {block.isComplete ? (
            'Block complete'
          ) : (
            <>
              Week <span className="num text-text">{block.weekNumber}</span> of{' '}
              <span className="num text-text">{block.totalWeeks}</span>
              {block.isDeloadWeek ? ' · Deload' : ''}
            </>
          )}
        </p>
        {block.sessionCount > 0 ? (
          <p className="shrink-0 text-micro tracking-wider text-text-muted uppercase">
            <span className="num">{block.sessionCount}</span> sessions in
          </p>
        ) : null}
      </div>

      {rest ? (
        <>
          <p className="mt-4 text-2xl text-text">Rest day</p>
          {view.nextDayLetter ? (
            <p className="mt-2 text-sm text-text-secondary">
              Next: Day {view.nextDayLetter} — {view.nextDayName}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-5">
            <span className="num text-5xl font-bold text-accent">
              {view.dayLetter}
            </span>
            <span className="text-lg text-balance text-text">{view.dayName}</span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            <span className="num">{view.exerciseCount}</span> exercises
          </p>
        </>
      )}

      <p className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
        <span className="font-medium text-accent">{callToAction(view.state)}</span>
        <span className="shrink-0 text-accent">›</span>
      </p>
      <p className="mt-1 text-micro tracking-wider text-text-muted uppercase">
        {statusLine(view.state, view.setsLoggedToday)}
      </p>
    </button>
  )
}

function callToAction(state: TodayState): string {
  switch (state) {
    case 'in_progress':
      return 'Resume session'
    case 'finish_previous':
      return 'Finish previous session'
    case 'completed':
      return 'Review today'
    case 'skipped':
      return 'Open today'
    case 'block_complete':
      return 'Start a new block'
    case 'rest':
      return 'Open the week'
    case 'ready':
    default:
      return 'Continue'
  }
}

function statusLine(state: TodayState, sets: number): string {
  switch (state) {
    case 'in_progress':
      return 'Session underway'
    case 'finish_previous':
      return 'An earlier workout is unfinished'
    case 'completed':
      return `Done · ${sets} sets logged`
    case 'skipped':
      return 'Skipped today'
    case 'block_complete':
      return 'Six weeks finished'
    case 'rest':
      return 'Nothing scheduled'
    case 'ready':
    default:
      return 'Ready when you are'
  }
}

function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function monthAndYear(iso: string): string {
  const date = fromIsoDate(iso)
  return `${date.toLocaleDateString('en-GB', { month: 'long' })} ${date.getFullYear()}`
}
