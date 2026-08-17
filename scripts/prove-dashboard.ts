/**
 * Browser proof for the dashboard board: the week reads Monday→Sunday, each
 * day is a real touch target, a day tapped there opens that day read-only,
 * completed work shows up in the chips and the week's totals, and the deep
 * link does not stick around to strand the next open on an old date.
 *
 *   npm run build && npm run prove-dashboard
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from '@playwright/test'
import { preview } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(here, '../screenshots')

function preinstalledChromium(): string | undefined {
  const root = process.env['PLAYWRIGHT_BROWSERS_PATH']
  if (!root || !existsSync(root)) return undefined
  return readdirSync(root)
    .filter((entry) => entry.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((entry) => join(root, entry, 'chrome-linux', 'chrome'))
    .find((path) => existsSync(path))
}

let failures = 0
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures += 1
}

/**
 * Two completed sessions and one skipped day in the week of Mon 17 August,
 * written straight into IndexedDB underneath the app's own seed.
 *
 * Passed to the page as a source string: tsx's esbuild transform injects a
 * __name helper into transpiled closures which does not exist in the page.
 */
const SEED_WEEK = `(async () => {
  const open = indexedDB.open('workout-tracker')
  const idb = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const read = (store) => new Promise((res) => {
    const req = idb.transaction(store).objectStore(store).getAll()
    req.onsuccess = () => res(req.result)
  })

  const templates = await read('dayTemplates')
  const meso = (await read('mesocycles'))[0]
  const dayA = templates.find((t) => t.letter === 'A')
  const dayB = templates.find((t) => t.letter === 'B')
  if (!meso || !dayA || !dayB) throw new Error('seed missing')

  const sessions = []
  const sets = []
  let uid = 0
  const id = (p) => 'proof-' + p + '-' + uid++

  // Monday: Day A finished, three sets of 185×10 = 5550 lb.
  const monday = id('session')
  sessions.push({
    id: monday, date: '2026-08-17', dayTemplateId: dayA.id, mesocycleId: meso.id,
    weekNumber: 1, isDeload: false, status: 'completed', currentExerciseIndex: 0,
    cardio: { durationMin: 45, inclinePct: 10, speedMph: 3 },
    startedAt: 1, completedAt: 2, updatedAt: 2,
  })
  for (let i = 0; i < 3; i += 1) {
    sets.push({
      id: id('set'), sessionId: monday, exerciseId: dayA.exerciseIds[0], setIndex: i,
      weightLb: 185, reps: 10, prescribedWeightLb: null, prescribedReps: null,
      loggedAt: 1, updatedAt: 1,
    })
  }

  // Tuesday: deliberately skipped.
  sessions.push({
    id: id('session'), date: '2026-08-18', dayTemplateId: dayB.id, mesocycleId: meso.id,
    weekNumber: 1, isDeload: false, status: 'skipped', currentExerciseIndex: 0,
    cardio: null, startedAt: 1, completedAt: null, updatedAt: 1,
  })

  await new Promise((res, rej) => {
    const tx = idb.transaction(['sessions', 'sets'], 'readwrite')
    for (const row of sessions) tx.objectStore('sessions').put(row)
    for (const row of sets) tx.objectStore('sets').put(row)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
  idb.close()
})()`

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const server = await preview({ preview: { port: 4178, strictPort: true }, logLevel: 'warn' })
  const resolvedUrl = server.resolvedUrls?.local[0]
  if (!resolvedUrl) throw new Error('no preview URL')
  const url: string = resolvedUrl

  const executablePath = preinstalledChromium()
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })

  async function open(hash = ''): Promise<Page> {
    const page = await context.newPage()
    // Wednesday of that week, so past, present and future all appear at once.
    await page.clock.setFixedTime(new Date('2026-08-19T18:30:00'))
    await page.goto(`${url}${hash}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
    )
    return page
  }

  try {
    console.log('\nBOARD — the week reads at a glance')
    const first = await open()
    await first.evaluate(SEED_WEEK)
    await first.close()

    const page = await open()
    await page.getByText('This week').waitFor()

    const days = page.getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/ })
    await days.first().waitFor()
    check('all seven days are on the board', (await days.count()) === 7)

    // Read the states off the accessible names: the colour is a shorthand for
    // these words, never the only carrier of the meaning.
    const names = await days.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label') ?? ''),
    )
    console.log(names.map((n) => `      ${n}`).join('\n'))
    check('Monday reads completed with its three sets', names[0] === 'Mon day A, completed, 3 sets')
    check('Tuesday reads skipped', names[1] === 'Tue day B, skipped')
    check('Wednesday reads today', names[2] === 'Wed day C, today')
    check('Thursday reads upcoming', names[3] === 'Thu day A, upcoming')
    check('Sunday reads rest', names[6] === 'Sun, rest day')

    console.log('\nTOTALS — only finished work counts')
    const totals = page.locator('section', { hasText: 'This week' }).first()
    const numbers = await totals.locator('.num').evaluateAll((els) =>
      els.map((el) => el.textContent?.trim() ?? ''),
    )
    check(
      'the week reads 1 session, 3 sets, 5,550 lb',
      numbers.includes('1') && numbers.includes('3') && numbers.includes('5,550'),
    )

    console.log('\nBLOCK — six weeks, the deload marked, week 1 live')
    check('block progress strip is present', (await page.getByText('D = deload').count()) === 1)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    check('no horizontal overflow', !overflow)
    await page.screenshot({ path: resolve(OUT_DIR, 'dashboard-board.png') })

    console.log('\nTAP A DAY — it opens that day, read-only')
    await page.getByRole('button', { name: 'Fri day B, upcoming' }).click()
    await page.getByText('Friday 21 August').waitFor()
    check('Friday’s plan opens from the board', true)
    check(
      'a browsed day offers no way to start it',
      (await page.getByRole('button', { name: 'Start workout' }).count()) === 0 &&
        (await page.getByRole('button', { name: 'Back to today' }).count()) === 1,
    )
    await page.screenshot({ path: resolve(OUT_DIR, 'dashboard-day-peek.png') })

    check(
      'the day is spent from the URL, so a reload lands on today',
      !page.url().includes('d=2026-08-21'),
    )
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Wednesday 19 August').waitFor()
    check('reloading /today shows today again', true)

    console.log(failures === 0 ? '\nRESULT: the dashboard board holds.' : `\nRESULT: ${failures} FAILED.`)
  } finally {
    await browser.close()
    await server.close()
  }
  if (failures > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
