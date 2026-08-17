import { useLiveQuery } from 'dexie-react-hooks'

import { Screen } from '../../components/Screen'
import {
  getDashboardView,
  type DashboardBlock,
  type DashboardView,
  type TodayState,
  type WeekDay,
  type WeekDayStatus,
  type WeekTotals,
} from '../../db/queries'
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
 *
 * Below the hand-off it answers the three questions worth asking before a
 * session, in the order they get asked: where am I this week, what have I
 * actually done, and how far through the block am I. Each day of the week is
 * tappable and opens that day's plan read-only, so the board is a map as well
 * as a report.
 */
export function DashboardScreen() {
  const date = useToday()
  const view = useLiveQuery(() => getDashboardView(date), [date])

  if (!view) return <Screen>{null}</Screen>

  const { activeBlock } = view

  return (
    /**
     * The footer is pinned rather than scrolled: now that the board makes this
     * screen taller than a phone, a scroll region running to the bottom edge
     * would drag tappable things through the home-indicator band. Pinning it
     * also puts History and Settings in the thumb zone, per Part 7.
     */
    <Screen
      action={
        <div>
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
        </div>
      }
    >
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

      <WeekBoard week={view.week} totals={view.weekTotals} />

      {view.blockWeeks.length > 0 ? (
        <BlockStrip weeks={view.blockWeeks} />
      ) : null}

      {view.backupOverdueDays !== null ? (
        <BackupNudge days={view.backupOverdueDays} />
      ) : null}

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
                  <span className="num">{block.sessionCount}</span>{' '}
                  {block.sessionCount === 1 ? 'session' : 'sessions'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 text-micro tracking-wider text-text-muted uppercase">
        {APP_VERSION}
      </p>
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
            <span className="num">{block.sessionCount}</span>{' '}
            {block.sessionCount === 1 ? 'session' : 'sessions'} in
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

/**
 * The week at a glance: seven columns, Monday first, each showing the day
 * letter and what became of it. Seven fixed columns fit a phone without
 * scrolling, which matters more here than the reference board's roomier
 * desktop layout — the whole week has to be readable in one look.
 *
 * Every column is tappable. /today treats a browsed date as strictly
 * read-only, so opening Thursday from Tuesday can only ever look.
 */
function WeekBoard({ week, totals }: { week: WeekDay[]; totals: WeekTotals }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs tracking-wider text-text-secondary uppercase">
        This week
      </h2>

      {/* One divided strip, not seven gapped chips: at 375px a gap of even
          4px would squeeze each column under the 44px touch floor. */}
      <ul className="mt-3 grid grid-cols-7 divide-x divide-border overflow-hidden rounded-md border border-border bg-surface">
        {week.map((day) => (
          <li key={day.date} className="flex">
            <DayChip day={day} />
          </li>
        ))}
      </ul>

      <p className="mt-3 flex flex-wrap gap-3 text-micro tracking-wider text-text-muted uppercase">
        <Key className="bg-accent" label="Done" />
        <Key className="bg-text-muted" label="Skipped" />
        <Key className="bg-alert" label="Missed" />
        <Key className="bg-text" label="Today" />
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Stat value={String(totals.sessions)} label="Sessions" />
        <Stat value={String(totals.sets)} label="Sets" />
        <Stat value={totals.volumeLb.toLocaleString('en-GB')} label="Lb moved" />
      </div>
    </section>
  )
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-1 w-3 shrink-0 rounded-full ${className}`} />
      {label}
    </span>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-3">
      <p className="num text-xl leading-tight text-text">{value}</p>
      <p className="mt-1 text-micro tracking-wider text-text-muted uppercase">
        {label}
      </p>
    </div>
  )
}

function DayChip({ day }: { day: WeekDay }) {
  const style = chipStyle(day.status, day.isToday)
  return (
    <button
      type="button"
      aria-label={dayChipLabel(day)}
      onClick={() => navigate('/today', { day: day.date })}
      className={`min-h-touch-comfortable w-full px-1 pt-2 pb-3 ${style.chip}`}
    >
      <span className={`mx-auto block h-1 w-3 rounded-full ${style.bar}`} />
      <span className="mt-2 block text-micro text-text-muted">{day.weekdayShort}</span>
      <span className={`num mt-1 block text-lg leading-tight font-bold ${style.letter}`}>
        {day.letter ?? '·'}
      </span>
    </button>
  )
}

/**
 * Status is carried by colour, but colour alone is never the whole message:
 * every chip also spells its state out to a screen reader, and the legend
 * above names each colour in words.
 */
function chipStyle(
  status: WeekDayStatus,
  isToday = false,
): { chip: string; letter: string; bar: string } {
  // A rest day that is *today* still gets the today marker (Phase 8): the
  // status ladder puts rest above today, which is right for progression but
  // left Sundays with no "you are here" on the board at all.
  if (status === 'rest' && isToday) {
    return { chip: 'bg-surface-raised', letter: 'text-text', bar: 'bg-text' }
  }
  switch (status) {
    case 'completed':
      return { chip: 'bg-accent-surface', letter: 'text-accent', bar: 'bg-accent' }
    case 'in_progress':
      return { chip: 'bg-accent-surface', letter: 'text-accent', bar: 'bg-accent' }
    // Near-white, not a third shade of red: at 12px a dark-red bar is
    // indistinguishable from the bright one that means done.
    case 'today':
      return { chip: 'bg-surface-raised', letter: 'text-text', bar: 'bg-text' }
    case 'skipped':
      return { chip: 'bg-surface', letter: 'text-text-muted', bar: 'bg-text-muted' }
    case 'missed':
      return { chip: 'bg-surface', letter: 'text-text-muted', bar: 'bg-alert' }
    case 'rest':
      return { chip: 'bg-bg', letter: 'text-text-muted', bar: 'bg-bg' }
    case 'upcoming':
    default:
      return { chip: 'bg-surface', letter: 'text-text-secondary', bar: 'bg-border' }
  }
}

function dayChipLabel(day: WeekDay): string {
  const which = `${day.weekdayShort}${day.letter ? ` day ${day.letter}` : ''}`
  switch (day.status) {
    case 'completed':
      return `${which}, completed, ${day.setsLogged} sets`
    case 'in_progress':
      return `${which}, in progress`
    case 'today':
      return `${which}, today`
    case 'skipped':
      return `${which}, skipped`
    case 'missed':
      return `${which}, missed`
    case 'rest':
      return day.isToday ? `${which}, today, rest day` : `${which}, rest day`
    case 'upcoming':
    default:
      return `${which}, upcoming`
  }
}

/**
 * Where this block stands: one segment per week, the deload marked D. The
 * mesocycle is the unit progression actually runs on, so it gets a permanent
 * readout rather than living only in the card's "week 3 of 6".
 */
function BlockStrip({ weeks }: { weeks: DashboardView['blockWeeks'] }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs tracking-wider text-text-secondary uppercase">
          Block progress
        </h2>
        <p className="shrink-0 text-micro tracking-wider text-text-muted uppercase">
          D = deload
        </p>
      </div>
      <ul className="mt-3 flex gap-1">
        {weeks.map((week) => (
          <li key={week.week} className="flex-1">
            <span
              className={`block h-2 rounded-full ${
                week.state === 'current'
                  ? 'bg-accent'
                  : week.state === 'past'
                    ? 'bg-accent-border'
                    : 'bg-border'
              }`}
            />
            <span
              className={`num mt-1 block text-center text-micro ${
                week.state === 'current' ? 'text-text' : 'text-text-muted'
              }`}
            >
              {week.isDeload ? 'D' : week.week}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The 30-day export reminder (PLAN §2.2): with no cloud copy, browser storage
 * is the only copy, so going quiet about backups is how a lost phone becomes
 * a lost history. Quiet by design — a bordered note, not an alarm — and one
 * tap from the fix.
 */
function BackupNudge({ days }: { days: number }) {
  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      className="mt-8 flex min-h-touch-min w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left"
    >
      <span className="text-sm text-text-secondary">
        No backup in <span className="num text-text">{days}</span> days — this
        phone holds the only copy.
      </span>
      <span className="shrink-0 text-xs tracking-wider text-text-secondary uppercase">
        Export ›
      </span>
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
