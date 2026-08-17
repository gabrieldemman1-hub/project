import { useEffect, useState } from 'react'

import { today } from './schedule'
import type { IsoDate } from '../db/schema'

/** Milliseconds from `now` until the next local midnight. */
export function msUntilNextMidnight(now: Date): number {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

/**
 * Today's date, kept current across a midnight rollover.
 *
 * Without this the date is only read when a component happens to re-render, so
 * a phone left on the home screen overnight — or a PWA resumed from the
 * background the next morning — would still show yesterday's day letter and
 * exercise list. That is cosmetic today and a data-correctness problem from
 * Phase 2 onward, where a logged session is keyed on this date.
 *
 * Also re-checks when the tab becomes visible again, because a background timer
 * is not guaranteed to have fired while the app was suspended.
 */
export function useToday(): IsoDate {
  const [date, setDate] = useState<IsoDate>(() => today())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const sync = () => {
      setDate(today())
      // Re-armed after every tick rather than on an interval, so it stays
      // aligned to midnight through daylight-saving changes.
      timer = setTimeout(sync, msUntilNextMidnight(new Date()) + 1_000)
    }

    timer = setTimeout(sync, msUntilNextMidnight(new Date()) + 1_000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') setDate(today())
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return date
}
