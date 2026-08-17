/**
 * Phase 6 gate (BRIEF Part 8): screenshots of the three history charts with
 * realistic seeded data.
 *
 * Lets the real app seed its own program first, then injects five weeks of
 * plausible Day A history — two sessions a week, weights creeping 185 → 205,
 * a set added mid-block, a deload week at the end — directly into IndexedDB,
 * and screenshots the history screen at iPhone size.
 *
 *   npm run build && npm run shoot-history
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'
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

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const server = await preview({ preview: { port: 4175, strictPort: true }, logLevel: 'warn' })
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
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2026-09-26T10:00:00'))

  try {
    // Let the app seed its program, then inject history underneath it.
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
    )

    // Passed as a source string: tsx's esbuild transform injects a __name
    // helper into transpiled closures which does not exist in the page.
    await page.evaluate(`(async () => {
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
      const dayA = templates.find((t) => t.letter === 'A')
      const meso = (await read('mesocycles'))[0]
      if (!dayA || !meso) throw new Error('seed missing')
      const pressId = dayA.exerciseIds[0]
      const flatId = dayA.exerciseIds[1]

      const sessions = []
      const sets = []
      let uid = 0
      const id = (p) => 'demo-' + p + '-' + uid++

      const addSession = (date, week, isDeload, press, flat) => {
        const sessionId = id('session')
        sessions.push({
          id: sessionId, date, dayTemplateId: dayA.id, mesocycleId: meso.id,
          weekNumber: week, isDeload, status: 'completed', currentExerciseIndex: 0,
          cardio: { durationMin: 45, inclinePct: 10, speedMph: 3 },
          startedAt: 1, completedAt: 2, updatedAt: 2,
        })
        for (const pair of [[pressId, press], [flatId, flat]]) {
          pair[1].reps.forEach((reps, setIndex) => {
            sets.push({
              id: id('set'), sessionId, exerciseId: pair[0], setIndex,
              weightLb: pair[1].w, reps, prescribedWeightLb: null, prescribedReps: null,
              loggedAt: 1, updatedAt: 1,
            })
          })
        }
      }

      addSession('2026-08-17', 1, false, { w: 185, reps: [10, 9, 8] }, { w: 150, reps: [11, 10, 9] })
      addSession('2026-08-20', 1, false, { w: 185, reps: [11, 10, 9] }, { w: 150, reps: [12, 11, 10] })
      addSession('2026-08-24', 2, false, { w: 190, reps: [9, 8, 8] }, { w: 155, reps: [10, 9, 9] })
      addSession('2026-08-27', 2, false, { w: 190, reps: [10, 9, 8, 8] }, { w: 155, reps: [11, 10, 9] })
      addSession('2026-08-31', 3, false, { w: 195, reps: [9, 8, 8, 7] }, { w: 160, reps: [10, 9, 8, 8] })
      addSession('2026-09-03', 3, false, { w: 195, reps: [10, 9, 8, 8] }, { w: 160, reps: [10, 10, 9, 8] })
      addSession('2026-09-07', 4, false, { w: 200, reps: [8, 8, 7, 7] }, { w: 165, reps: [9, 9, 8, 8] })
      addSession('2026-09-10', 4, false, { w: 200, reps: [9, 8, 8, 8] }, { w: 165, reps: [10, 9, 9, 8] })
      addSession('2026-09-14', 5, false, { w: 205, reps: [8, 8, 7, 6] }, { w: 170, reps: [9, 8, 8, 7] })
      addSession('2026-09-17', 5, false, { w: 205, reps: [9, 8, 8, 7] }, { w: 170, reps: [9, 9, 8, 8] })
      addSession('2026-09-21', 6, true, { w: 185, reps: [10, 10] }, { w: 155, reps: [10, 10] })

      await new Promise((res, rej) => {
        const tx = idb.transaction(['sessions', 'sets'], 'readwrite')
        for (const row of sessions) tx.objectStore('sessions').put(row)
        for (const row of sets) tx.objectStore('sets').put(row)
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      idb.close()
    })()`)

    // Fresh load so the injected history is what the app reads.
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'History' }).click()
    await page.waitForSelector('svg')
    // Recharts needs a beat to measure its responsive containers.
    await page.waitForTimeout(600)

    check('three charts render', (await page.locator('.recharts-responsive-container').count()) === 3)
    check(
      'both trained exercises are pickable',
      (await page.getByRole('button', { name: 'Incline hammer strength press' }).count()) === 1 &&
        (await page.getByRole('button', { name: 'Flat or low-incline machine press' }).count()) === 1,
    )
    // Assert the actual computed number, not just the card title: the header
    // of the weight card must read the latest session's top set — 185, the
    // deload day — proving the math and the oldest-first ordering together.
    const weightCard = page
      .locator('section', { hasText: 'Top set weight' })
      .first()
    check(
      'latest top-set weight reads 185 (the deload)',
      (await weightCard.locator('.num').first().innerText()) === '185',
    )
    const volumeCard = page.locator('section', { hasText: 'Session volume' }).first()
    check(
      'latest volume reads 3700 (185×10 + 185×10)',
      (await volumeCard.locator('.num').first().innerText()) === '3700',
    )
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    check('no horizontal overflow', !overflow)

    await page.screenshot({ path: resolve(OUT_DIR, 'history-charts.png'), fullPage: false })
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(OUT_DIR, 'history-charts-scrolled.png') })

    // Switch exercise: charts follow.
    await page.getByRole('button', { name: 'Flat or low-incline machine press' }).click()
    await page.waitForTimeout(400)
    check(
      'switching exercise keeps three charts',
      (await page.locator('.recharts-responsive-container').count()) === 3,
    )

    console.log(failures === 0 ? '\nRESULT: history renders with realistic data.' : `\nRESULT: ${failures} FAILED.`)
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
