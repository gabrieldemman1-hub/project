/**
 * Streaks. PURE — `today` is always a parameter, never read from a clock.
 *
 * Two exported functions over two separate tables. `readingStreak` is only ever
 * handed reading logs and `reviewStreak` is only ever handed closed review
 * sessions, so review activity CANNOT break the reading streak: the guarantee
 * is structural, not a rule someone has to remember. The shared core below
 * takes an opaque bag of day keys and has no idea which loop it is counting.
 */
import { addDays, type DayKey } from './day'

export interface DayStamped {
  dayKey: DayKey
}

export type StreakStatus = 'active' | 'at_risk' | 'broken'

export interface Streak {
  /** Days in the run ending today or yesterday. 0 when the run is dead. */
  current: number
  longest: number
  /** The last day with real activity, ignoring exempt days. */
  lastDay: DayKey | null
  doneToday: boolean
  status: StreakStatus
}

const KEY = /^\d{4}-\d{2}-\d{2}$/

function usableDays(entries: readonly DayStamped[], today: DayKey): Set<DayKey> {
  const out = new Set<DayKey>()
  for (const e of entries) {
    const d = e?.dayKey
    // Future-dated rows are dropped entirely rather than trusted. A clock-skewed
    // entry must never bridge a gap you actually left.
    if (typeof d === 'string' && KEY.test(d) && d <= today) out.add(d)
  }
  return out
}

/**
 * @param active days on which the thing actually happened
 * @param exempt days that count as satisfied without adding to the count —
 *        used only by the review streak, for nights when nothing was due
 */
function computeStreak(active: Set<DayKey>, exempt: Set<DayKey>, today: DayKey): Streak {
  const satisfied = (d: DayKey) => active.has(d) || exempt.has(d)

  const lastDay = active.size === 0 ? null : [...active].sort().at(-1) ?? null
  const doneToday = satisfied(today)

  // Walk back from today, or from yesterday if today has not happened yet — a
  // streak earned through yesterday is still alive at 8am.
  let cursor: DayKey | null = null
  if (satisfied(today)) cursor = today
  else if (satisfied(addDays(today, -1))) cursor = addDays(today, -1)

  let current = 0
  while (cursor && satisfied(cursor)) {
    if (active.has(cursor)) current++
    cursor = addDays(cursor, -1)
  }

  // Longest across the whole history. Exempt days bridge a run but never add
  // to it, exactly as they do for `current`.
  let longest = 0
  const ordered = [...new Set([...active, ...exempt])].sort()
  let run = 0
  let previous: DayKey | null = null
  for (const day of ordered) {
    const contiguous = previous !== null && addDays(previous, 1) === day
    run = contiguous ? run : 0
    if (active.has(day)) run++
    if (run > longest) longest = run
    previous = day
  }

  const status: StreakStatus = current === 0 ? 'broken' : doneToday ? 'active' : 'at_risk'

  return { current, longest, lastDay, doneToday, status }
}

/** Breaks only on a day with no logged chapter. Never sees a review. */
export function readingStreak(logs: readonly DayStamped[], today: DayKey): Streak {
  return computeStreak(usableDays(logs, today), new Set(), today)
}

/**
 * Breaks on a night with no closed review session — unless nothing was due.
 *
 * With intervals of 1/3/7/14/30 a light reading week routinely produces nights
 * with an empty queue. Breaking the streak there would punish the user for the
 * scheduler's arithmetic rather than for anything they did.
 *
 * @param exemptDays nights on which no note was due. Empty in Phase 2, where
 *        the reviews table does not exist yet; supplied from Phase 3 onward.
 */
export function reviewStreak(
  sessions: readonly DayStamped[],
  today: DayKey,
  exemptDays: readonly DayKey[] = [],
): Streak {
  const exempt = usableDays(
    exemptDays.map((dayKey) => ({ dayKey })),
    today,
  )
  return computeStreak(usableDays(sessions, today), exempt, today)
}
