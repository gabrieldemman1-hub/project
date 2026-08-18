import type { Streak } from '../lib/streaks'

/**
 * The loud one. Big, amber, tabular figures so it doesn't jump as it ticks.
 * The subtitle carries the nuance so the number itself never flickers between
 * "5" and "0" depending on whether today is done yet.
 */
export function StreakNumber({ streak, unit = 'day' }: { streak: Streak; unit?: string }) {
  const label =
    streak.status === 'broken'
      ? streak.longest > 0
        ? `Best was ${streak.longest}. Start again today.`
        : 'Log a chapter to start one.'
      : streak.doneToday
        ? 'Done today.'
        : 'Read today to keep it.'

  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-[4.5rem] leading-none font-semibold tnum text-accent-ink">
          {streak.current}
        </span>
        <span className="text-lg text-ink-quiet">
          {unit}
          {streak.current === 1 ? '' : 's'}
        </span>
      </p>
      <p className="text-sm text-ink-quiet mt-2">{label}</p>
    </div>
  )
}
