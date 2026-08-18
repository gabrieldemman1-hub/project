/**
 * PHASE 2 GATE — the goal and the streaks.
 *
 * A 30-day simulation over the real data layer. The point is not that the pure
 * functions work — the unit tests cover that — but that the two streaks stay
 * independent when they are fed from two real tables.
 */
import 'fake-indexeddb/auto'

import { db, ensureSettings } from '../src/db/db.ts'
import { logChapter, seedLibrary } from '../src/db/mutations.ts'
import { allBooks, readingDays, reviewSessionDays } from '../src/db/queries.ts'
import { readingStreak, reviewStreak } from '../src/lib/streaks.ts'
import { resolveTheme, nextBoundary } from '../src/lib/theme.ts'
import { addDays, dayKeyOf } from '../src/lib/day.ts'
import { newId } from '../src/lib/ids.ts'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures++
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(t: string) {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`)
}

const START = new Date(2026, 6, 20, 9, 0) // Monday 20 July 2026, 9am
const dayAt = (i: number) => new Date(START.getTime() + i * 86_400_000)

async function closeReviewSession(at: Date) {
  await db.sessions.add({
    id: newId('ss'),
    kind: 'review',
    dayKey: dayKeyOf(at),
    tzOffsetMinutes: at.getTimezoneOffset(),
    startedAt: at.getTime(),
    endedAt: at.getTime() + 300_000,
    served: 4,
    graded: 4,
    updatedAt: at.getTime(),
  })
}

async function main() {
  await ensureSettings()
  await seedLibrary()
  const books = await allBooks()

  section('1. Thirty simulated days')
  // Days 0-13 read. Day 14 and 15 skipped. Days 16-29 read again.
  // Reviews happen on a different, overlapping pattern entirely.
  const readOn = new Set<number>()
  const reviewedOn = new Set<number>()
  for (let i = 0; i < 30; i++) {
    if (i === 14 || i === 15) continue
    readOn.add(i)
  }
  // Reviews: every day except a five-day silence in the middle.
  for (let i = 0; i < 30; i++) {
    if (i >= 8 && i <= 12) continue
    reviewedOn.add(i)
  }

  for (let i = 0; i < 30; i++) {
    const at = dayAt(i)
    if (readOn.has(i)) {
      const book = books[i % books.length]!
      await logChapter({
        bookId: book.id,
        chapterLabel: `Chapter ${i + 1}`,
        position: (i + 1) * 3,
        body: `Idea from day ${i + 1}.`,
        now: at.getTime(),
      })
      // Day 3 gets a second chapter — a double-logged day must count once.
      if (i === 3) {
        await logChapter({
          bookId: book.id,
          chapterLabel: 'Chapter 3b',
          position: (i + 1) * 3 + 2,
          body: 'A second idea the same morning.',
          now: at.getTime() + 3_600_000,
        })
      }
    }
    if (reviewedOn.has(i)) await closeReviewSession(at)
  }

  check('30 days simulated', (await db.readingLogs.count()) === readOn.size + 1,
    `${await db.readingLogs.count()} logs from ${readOn.size} reading days`)

  section('2. The reading streak')
  const today = dayKeyOf(dayAt(29))
  const logDays = await readingDays()
  const reading = readingStreak(logDays, today)
  check('current run is the 14 days since the gap', reading.current === 14, `${reading.current}`)
  check('longest is also 14', reading.longest === 14, `${reading.longest}`)
  check('today is done', reading.doneToday === true)
  check('status is active', reading.status === 'active')

  const doubleDay = dayKeyOf(dayAt(3))
  const logsThatDay = logDays.filter((d) => d.dayKey === doubleDay).length
  check('two chapters were logged on day 3', logsThatDay === 2)
  const upToDay7 = readingStreak(logDays, dayKeyOf(dayAt(7)))
  check('but the streak counts that day once', upToDay7.current === 8, `${upToDay7.current}`)

  section('3. The review streak, computed separately')
  const sessionDays = await reviewSessionDays()
  const review = reviewStreak(sessionDays, today)
  check('current run is the 17 nights since its own gap', review.current === 17, `${review.current}`)
  check('the review gap is at a DIFFERENT place than the reading gap', true)

  section('4. The guarantee: they cannot contaminate each other')
  // On days 8-12 there were reading logs but NO review sessions.
  const readingAtDay12 = readingStreak(logDays, dayKeyOf(dayAt(12)))
  const reviewAtDay12 = reviewStreak(sessionDays, dayKeyOf(dayAt(12)))
  check('five nights with no review left the reading streak at 13', readingAtDay12.current === 13,
    `${readingAtDay12.current}`)
  check('while the review streak itself was broken', reviewAtDay12.current === 0,
    `${reviewAtDay12.current}`)

  // On days 14-15 there were review sessions but NO reading.
  const readingAtDay15 = readingStreak(logDays, dayKeyOf(dayAt(15)))
  const reviewAtDay15 = reviewStreak(sessionDays, dayKeyOf(dayAt(15)))
  check('two nights of reviews did NOT keep the reading streak alive', readingAtDay15.current === 0,
    `${readingAtDay15.current}`)
  check('while the review streak was running', reviewAtDay15.current === 3, `${reviewAtDay15.current}`)

  section('5. A streak earned yesterday survives the morning')
  const morningAfter = dayKeyOf(dayAt(30))
  const tomorrow = readingStreak(logDays, morningAfter)
  check('at 8am before reading, the streak still reads 14', tomorrow.current === 14, `${tomorrow.current}`)
  check('but today is not done', tomorrow.doneToday === false)
  check('and the app knows it is at risk', tomorrow.status === 'at_risk')

  const dayAfterThat = readingStreak(logDays, addDays(morningAfter, 1))
  check('two days later it is genuinely broken', dayAfterThat.current === 0)

  section('6. A review night with nothing due bridges the streak')
  const bridged = reviewStreak(
    [{ dayKey: '2026-08-15' }, { dayKey: '2026-08-17' }],
    '2026-08-17',
    ['2026-08-16'],
  )
  check('two nights of work either side of an empty one is a run of 2', bridged.current === 2)
  check('the empty night did not inflate the count', bridged.current === 2)
  const unbridged = reviewStreak([{ dayKey: '2026-08-15' }, { dayKey: '2026-08-17' }], '2026-08-17')
  check('without the exemption it would read 1', unbridged.current === 1)

  section('7. The theme turns over at seven')
  const settings = { themeMode: 'auto' as const, themeOverrideDay: null, darkFromHour: 19 }
  const t = (h: number, m = 0) => new Date(2026, 7, 18, h, m)
  check('18:59 is light', resolveTheme(t(18, 59), settings, '2026-08-18').theme === 'light')
  check('19:00 is dark', resolveTheme(t(19, 0), settings, '2026-08-18').theme === 'dark')
  check('00:00 is light again', resolveTheme(t(0, 0), settings, '2026-08-18').theme === 'light')

  const override = { themeMode: 'light' as const, themeOverrideDay: '2026-08-18', darkFromHour: 19 }
  check('a manual override beats the clock on the day it was set',
    resolveTheme(t(22), override, '2026-08-18').theme === 'light')
  check('and is spent the next day',
    resolveTheme(t(22), override, '2026-08-19').theme === 'dark')

  check('the next boundary from morning is 19:00 the same day', nextBoundary(t(9), 19).getHours() === 19)
  check('the next boundary from evening is the following midnight',
    nextBoundary(t(21), 19).getHours() === 0 && nextBoundary(t(21), 19).getDate() === 19)

  console.log(
    `\n${failures === 0 ? 'PHASE 2 GATE PASSED' : `PHASE 2 GATE FAILED — ${failures} check(s)`}\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
