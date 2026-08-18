/**
 * PHASE 3 GATE — the review scheduler.
 *
 * Part A runs against the real data layer with fake-indexeddb.
 * Part B drives the built app in a real browser, and is the part that matters:
 * it asserts the note body is ABSENT FROM THE DOM before the reveal tap, and
 * that a session survives the app being relaunched underneath it.
 */
import 'fake-indexeddb/auto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { chromium, type Page } from '@playwright/test'

import { db, ensureSettings } from '../src/db/db.ts'
import { logChapter, seedLibrary } from '../src/db/mutations.ts'
import { allBooks } from '../src/db/queries.ts'
import { gradeReview, openOrResumeSession, pendingReviews, tonightsQueue } from '../src/db/reviews.ts'
import { buildSession, firstReview, nextReview } from '../src/lib/scheduler.ts'
import { dayKeyOf, diffDays } from '../src/lib/day.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const PORT = 4322
const BASE = `http://127.0.0.1:${PORT}/`

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`[${ok ? '  ok  ' : ' FAIL '}] ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(t: string) {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`)
}

const DAY0 = new Date(2026, 7, 18, 8, 0)
const at = (n: number) => new Date(DAY0.getTime() + n * 86_400_000)
const key = (n: number) => dayKeyOf(at(n))

/* ------------------------------------------------------------------ Part A */

async function partA() {
  await ensureSettings()
  await seedLibrary()
  const books = await allBooks()

  section('A1. The ladder — the brief’s own 55-day test')
  const created = key(0)
  const dueDays: number[] = []
  let review = firstReview(created)
  dueDays.push(diffDays(created, review.dueDate))
  for (let i = 0; i < 4; i++) {
    review = nextReview({ intervalIndex: review.intervalIndex }, 'got_it', review.dueDate)
    dueDays.push(diffDays(created, review.dueDate))
  }
  check('due days are 1, 4, 11, 25, 55', JSON.stringify(dueDays) === '[1,4,11,25,55]', dueDays.join(', '))
  check('the fifth review lands exactly 55 days out', dueDays.at(-1) === 55)

  section('A2. The three grades')
  check('got it advances', nextReview({ intervalIndex: 1 }, 'got_it', key(1)).intervalDays === 7)
  check('partial repeats', nextReview({ intervalIndex: 2 }, 'partial', key(1)).intervalDays === 7)
  check('missed resets to tomorrow', nextReview({ intervalIndex: 4 }, 'missed', key(1)).intervalDays === 1)
  check('the top of the ladder clamps', nextReview({ intervalIndex: 4 }, 'got_it', key(1)).intervalIndex === 4)

  let alwaysForward = true
  for (const g of ['got_it', 'partial', 'missed'] as const) {
    for (let i = 0; i <= 4; i++) {
      if (!(nextReview({ intervalIndex: i }, g, key(3)).dueDate > key(3))) alwaysForward = false
    }
  }
  check('no grade can ever schedule a note back into today', alwaysForward)

  section('A3. Reviewing late reschedules from the day you actually did it')
  check('due day 1, reviewed day 10, next is day 13',
    nextReview({ intervalIndex: 0 }, 'got_it', key(10)).dueDate === key(13))

  section('A4. Missing a note repeatedly does not spiral')
  const note = (
    await logChapter({
      bookId: books[0]!.id,
      chapterLabel: 'Ch 1',
      position: 10,
      body: 'A repeatedly missed idea.',
      now: at(0).getTime(),
    })
  ).note

  let invariantHeld = true
  for (let day = 1; day <= 5; day++) {
    const open = (await db.reviews.toArray()).filter((r) => r.noteId === note.id && r.pending === 1)
    if (open.length !== 1) invariantHeld = false
    await gradeReview(open[0]!.id, 'missed', key(day), at(day).getTime())
  }
  const after = (await db.reviews.toArray()).filter((r) => r.noteId === note.id && r.pending === 1)
  check('exactly one pending review throughout five misses', invariantHeld && after.length === 1)
  check('it is back at the bottom of the ladder, due tomorrow', after[0]!.intervalIndex === 0 && after[0]!.dueDate === key(6))
  check('the full history is kept', (await db.reviews.toArray()).filter((r) => r.noteId === note.id).length === 6)

  section('A5. Grading is replay safe')
  const open = after[0]!
  const first = await gradeReview(open.id, 'got_it', key(6), at(6).getTime())
  const replay = await gradeReview(open.id, 'got_it', key(6), at(6).getTime())
  check('the first grade takes', first !== null)
  check('a replayed write is a no-op, not a double advance', replay === null)
  const nowPending = (await db.reviews.toArray()).filter((r) => r.noteId === note.id && r.pending === 1)
  check('the note advanced exactly one rung', nowPending[0]!.intervalIndex === 1)

  section('A6. The cap holds and says what it held back')
  for (let i = 1; i < 40; i++) {
    await logChapter({
      bookId: books[i % books.length]!.id,
      chapterLabel: `Ch ${i}`,
      position: i,
      body: `Idea number ${i}.`,
      now: at(0).getTime(),
    })
  }
  // Day 7: nothing has been graded on it, so the whole night's allowance is free.
  const queue = await tonightsQueue(key(7), 5)
  check('five served', queue.queue.length === 5, `${queue.queue.length}`)
  check('39 due in total', queue.dueCount === 39, `${queue.dueCount}`)
  check('34 held back', queue.heldBack === 34, `${queue.heldBack}`)
  check('and it is not reported as nothing due', queue.nothingDue === false)

  const pending = await pendingReviews()
  const a = buildSession(pending, key(7), 5).queue.map((r) => r.id)
  const b = buildSession([...pending].reverse(), key(7), 5).queue.map((r) => r.id)
  check('the same five are chosen however the rows arrive', JSON.stringify(a) === JSON.stringify(b))

  section('A6b. The cap belongs to the NIGHT, not to the session')
  // Day 1 already had one review graded in A4, so its allowance is one short.
  const day1 = await tonightsQueue(key(1), 5)
  check('a night that already did one review only offers four more',
    day1.queue.length === 4 && day1.alreadyDone === 1,
    `served ${day1.queue.length}, already done ${day1.alreadyDone}`)

  section('A7. Clearing the queue does not refill it')
  let refilled = false
  for (const r of buildSession(pending, key(7), 5).queue) {
    const before = (await tonightsQueue(key(7), 50)).dueCount
    await gradeReview(r.id, 'got_it', key(7), at(7).getTime())
    const afterCount = (await tonightsQueue(key(7), 50)).dueCount
    if (afterCount !== before - 1) refilled = true
  }
  check('each grade removed exactly one note from tonight', !refilled)

  const spent = await tonightsQueue(key(7), 5)
  check('and once five are done the night is closed, however many remain due',
    spent.capReached === true && spent.queue.length === 0 && spent.dueCount > 0,
    `${spent.dueCount} still due`)

  section('A8. The session is frozen and resumable')
  const s1 = await openOrResumeSession(key(8), 5, at(8).getTime())
  const s2 = await openOrResumeSession(key(8), 5, at(8).getTime())
  check('reopening resumes the same session', s1.id === s2.id)
  check('with the same five notes', JSON.stringify(s1.reviewIds) === JSON.stringify(s2.reviewIds))
  check('the session records what it held back', s1.heldBack > 0)
}

/* ------------------------------------------------------------------ Part B */

function preinstalledChromium(): string | undefined {
  const dir = process.env['PLAYWRIGHT_BROWSERS_PATH']
  if (!dir || !existsSync(dir)) return undefined
  return readdirSync(dir)
    .filter((e) => e.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((e) => join(dir, e, 'chrome-linux', 'chrome'))
    .find((p) => existsSync(p))
}

async function waitForServer(url: string, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Preview server never came up at ${url}`)
}

const NOTES = [
  'Attention residue is the cost of switching, not the switching itself.',
  'A grand slam offer makes the price feel like an afterthought.',
  'Confident humility is knowing what you do not know yet.',
  'Compounding rewards endurance far more than it rewards intensity.',
  'The motive for leading decides which hard job you will actually do.',
  'Structure beats willpower for anything you do every single day.',
  'Trust is the willingness to be vulnerable in front of your team.',
]

async function logChapterInUi(page: Page, index: number) {
  await page.goto(`${BASE}#/log`)
  await page.getByPlaceholder('Chapter', { exact: true }).waitFor()
  await page.getByPlaceholder('Chapter', { exact: true }).fill(`Chapter ${index + 1}`)
  await page.getByPlaceholder(/most important idea/).fill(NOTES[index]!)
  await page.getByRole('button', { name: 'Save chapter' }).click()
  await page.getByTestId('celebration').waitFor()
  await page.getByTestId('celebration').click()
  await page.getByText('Reading streak').waitFor()
}

async function partB() {
  const server: ChildProcess = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: root, stdio: 'ignore' },
  )
  const exe = preinstalledChromium()
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})

  try {
    await waitForServer(BASE)
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    await context.clock.setFixedTime(new Date(2026, 7, 18, 9, 0))
    const page = await context.newPage()

    section('B1. Seven notes written this morning')
    await page.goto(BASE)
    await page.getByText('Reading streak').waitFor()
    for (let i = 0; i < NOTES.length; i++) await logChapterInUi(page, i)
    check('seven chapters logged through the real UI', true)

    const dueTonight = await page.getByText(/Nothing due tonight/).count()
    check('nothing is due the same night they were written', dueTonight > 0)

    section('B2. The next evening')
    await context.clock.setFixedTime(new Date(2026, 7, 19, 20, 0))
    await page.reload()
    await page.getByText('Reading streak').waitFor()
    const theme = await page.evaluate(() => document.documentElement.dataset['theme'])
    check('the app is dark at 8pm, which is the signal', theme === 'dark', `${theme}`)
    await page.getByRole('link', { name: /Recall 5 notes/ }).first().click()

    section('B3. THE INVARIANT — the note body is not in the DOM before the reveal')
    await page.getByTestId('reveal').waitFor()

    const hiddenState = await page.evaluate((bodies: string[]) => {
      const html = document.documentElement.outerHTML
      return {
        anyBodyInDom: bodies.filter((b) => html.includes(b)),
        anyFragmentInDom: bodies.filter((b) => html.includes(b.slice(0, 30))),
        bodyElementExists: document.querySelector('[data-testid="note-body"]') !== null,
        gradeBarExists: document.querySelector('[data-testid="grade-bar"]') !== null,
        text: document.body.innerText,
      }
    }, NOTES)

    check('no note body appears anywhere in the document', hiddenState.anyBodyInDom.length === 0,
      hiddenState.anyBodyInDom.join(' | '))
    check('not even a 30-character fragment of one', hiddenState.anyFragmentInDom.length === 0,
      hiddenState.anyFragmentInDom.join(' | '))
    check('the body element is not rendered at all', hiddenState.bodyElementExists === false)
    check('the grade bar does not exist before the reveal', hiddenState.gradeBarExists === false)
    check('the screen says grading opens after revealing',
      hiddenState.text.includes('Grading opens after you reveal'))
    check('the held-back count is stated plainly', /5 of 7 tonight/.test(hiddenState.text),
      hiddenState.text.split('\n').find((l) => l.includes('tonight')) ?? '')

    await page.screenshot({ path: resolve(root, 'screenshots/night-01-hidden.png') })

    section('B4. After the reveal')
    await page.getByTestId('reveal').click()
    await page.getByTestId('note-body').waitFor()

    const revealedState = await page.evaluate(() => ({
      body: document.querySelector('[data-testid="note-body"]')?.textContent ?? '',
      gradeBarExists: document.querySelector('[data-testid="grade-bar"]') !== null,
    }))
    check('the note body is now rendered', NOTES.includes(revealedState.body.trim()),
      revealedState.body.slice(0, 40))
    check('and only now does the grade bar exist', revealedState.gradeBarExists === true)
    await page.screenshot({ path: resolve(root, 'screenshots/night-02-revealed.png') })

    section('B5. Grade three, then relaunch the app underneath it')
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('reveal').click().catch(() => undefined)
      await page.getByTestId('note-body').waitFor()
      await page.getByRole('button', { name: i === 1 ? 'Partial' : 'Got it' }).click()
      await page.waitForTimeout(900)
    }
    const beforeReload = await page.evaluate(() => document.body.innerText)
    check('the counter has advanced to the fourth note', /4 of 5/.test(beforeReload),
      beforeReload.split('\n').find((l) => /of 5/.test(l)) ?? '')

    // iOS relaunches a discarded app cold. A reload is exactly that: the whole
    // React tree is thrown away and rebuilt from IndexedDB.
    await page.reload()
    await page.getByTestId('reveal').waitFor()

    const resumed = await page.evaluate(() => document.body.innerText)
    check('the session resumed with only the ungraded notes left', /1 of 2/.test(resumed),
      resumed.split('\n').find((l) => /of 2/.test(l)) ?? '')
    const stillHidden = await page.evaluate((bodies: string[]) => {
      const html = document.documentElement.outerHTML
      return bodies.filter((b) => html.includes(b)).length
    }, NOTES)
    check('and the next note is hidden again after the relaunch', stillHidden === 0)

    // The dashboard agrees about what is left.
    await page.goto(`${BASE}#/`)
    await page.getByText('Reading streak').waitFor()
    const dash = await page.evaluate(() => document.body.innerText)
    check('the three grades survived — the dashboard offers the remaining two',
      /Recall 2 notes/.test(dash), dash.split('\n').find((l) => /Recall/.test(l)) ?? '')
    // 7 were written; 3 are graded and rescheduled, so 4 remain due tonight and
    // the night's remaining allowance is 2.
    check('and the dashboard agrees 4 are still due tonight',
      /of 4 due/.test(dash), dash.split('\n').find((l) => /waiting/.test(l)) ?? '')
    await page.goto(`${BASE}#/night`)
    await page.getByTestId('reveal').waitFor()

    section('B6. Finishing the night')
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('reveal').click()
      await page.getByTestId('note-body').waitFor()
      await page.getByRole('button', { name: 'Got it' }).click()
      await page.waitForTimeout(900)
    }
    await page.getByTestId('session-summary').waitFor()
    const summary = await page.evaluate(() => document.body.innerText)
    check('the session closes with a summary', /Recall done/.test(summary))
    check('and the review streak is credited', /night/.test(summary))
    await page.screenshot({ path: resolve(root, 'screenshots/night-03-summary.png') })

    section('B7. The cap is for the NIGHT, not for the session')
    // Five graded tonight, two still due. Starting again must not hand over
    // five more — that would make the cap meaningless.
    // Via the dashboard: navigating to the hash we are already on would not
    // remount anything.
    await page.goto(`${BASE}#/`)
    await page.getByText('Reading streak').waitFor()
    const afterNight = await page.evaluate(() => document.body.innerText)
    check("the dashboard stops offering recall once the night's allowance is spent",
      !/Recall \d+ notes/.test(afterNight),
      afterNight.split('\n').find((l) => /Recall|keep until/.test(l)) ?? '')
    await page.goto(`${BASE}#/night`)
    await page.getByText("That's tonight's five.").waitFor()
    const capped = await page.evaluate(() => document.body.innerText)
    check('a second session tonight is refused', /tonight's five/i.test(capped))
    check('and it says what keeps until tomorrow', /keep until tomorrow/.test(capped))
    check('while promising nothing was marked missed', /nothing was marked missed/i.test(capped))
    await page.screenshot({ path: resolve(root, 'screenshots/night-04-cap-reached.png') })

    section('B8. Walking away mid-session still banks the night')
    // A hash change fires neither pagehide nor visibilitychange, so tapping
    // "Home" after grading used to strand the session open and uncounted —
    // the user did the work and the streak broke anyway.
    await context.clock.setFixedTime(new Date(2026, 7, 20, 20, 30))
    await page.goto(`${BASE}#/`)
    await page.getByText('Reading streak').waitFor()
    await page.getByRole('link', { name: /Recall \d+ notes?/ }).first().click()
    await page.getByTestId('reveal').waitFor()
    await page.getByTestId('reveal').click()
    await page.getByTestId('note-body').waitFor()
    await page.getByRole('button', { name: 'Got it' }).click()
    await page.waitForTimeout(900)

    // Leave by tapping the back link, not by reloading.
    await page.getByRole('link', { name: /Home/ }).click()
    await page.getByText('Reading streak').waitFor()
    await page.waitForTimeout(400)
    const banked = await page.evaluate(() => document.body.innerText)
    check('the night the user earned is credited, not lost',
      /Review streak\s+[1-9]/.test(banked.replace(/\n/g, ' ')),
      banked.split('\n').find((l) => /Review streak/.test(l)) ?? '')

    section('B9. Genuinely nothing due, and reviewing early anyway')
    // Rewind to the morning the notes were written: none of them were due yet.
    await context.clock.setFixedTime(new Date(2026, 7, 18, 9, 0))
    await page.goto(`${BASE}#/`)
    await page.getByText('Reading streak').waitFor()
    await page.goto(`${BASE}#/night`)
    await page.getByText('Nothing due tonight.').waitFor()
    const nothing = await page.evaluate(() => document.body.innerText)
    check('it says so plainly', /Nothing due tonight/.test(nothing))
    check('and offers to review early anyway', /Review something early/.test(nothing))
    await page.screenshot({ path: resolve(root, 'screenshots/night-05-nothing-due.png') })

    // The control has to actually work, not just render.
    await page.getByRole('button', { name: 'Review something early' }).click()
    await page.getByTestId('reveal').waitFor()
    const early = await page.evaluate((bodies: string[]) => ({
      hidden: bodies.filter((b) => document.documentElement.outerHTML.includes(b)).length,
      gradeBar: document.querySelector('[data-testid="grade-bar"]') !== null,
    }), NOTES)
    check('reviewing early serves a real card', true)
    check('and it is hidden exactly like a due one', early.hidden === 0 && !early.gradeBar)
    await page.screenshot({ path: resolve(root, 'screenshots/night-06-early.png') })

    await context.close()
  } finally {
    await browser.close()
    server.kill()
  }
}

async function main() {
  console.log('Building…')
  const built = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' })
  if (built.status !== 0) throw new Error('build failed')

  await partA()
  await partB()

  console.log(
    `\n${failures === 0 ? 'PHASE 3 GATE PASSED' : `PHASE 3 GATE FAILED — ${failures} check(s)`}\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
