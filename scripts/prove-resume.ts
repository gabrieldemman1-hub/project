/**
 * Phase 2 gate (BRIEF Part 8): "kill the tab mid-session, reopen, and prove
 * the session resumes with the logged sets intact."
 *
 * Drives the real production build in a real Chromium at iPhone size:
 * starts a session, logs sets across two exercises, kills the page with no
 * warning, opens a fresh one against the same origin storage, and asserts —
 * from what is actually rendered on screen — that the session resumed on the
 * right exercise with every set still there.
 *
 *   npm run build && npm run prove-resume
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from '@playwright/test'
import { preview } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(here, '../screenshots')

const VIEWPORT = { width: 390, height: 844 }
/** A Monday, so the session is Day A — Chest & Triceps. */
const FROZEN_DATE = new Date('2026-08-17T18:30:00')

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
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Types a value into a stepper via its tap-to-type fallback. */
async function typeIntoStepper(page: Page, label: string, value: string) {
  await page.getByRole('button', { name: new RegExp(`^${label}:.*Tap to type`) }).click()
  const input = page.getByRole('textbox', { name: label })
  await input.fill(value)
  await input.press('Enter')
}

async function openApp(context: Awaited<ReturnType<typeof newContext>>, url: string) {
  const page = await context.newPage()
  await page.clock.setFixedTime(FROZEN_DATE)
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
  )
  return page
}

async function newContext(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  return browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const server = await preview({
    preview: { port: 4174, strictPort: true },
    logLevel: 'warn',
  })
  const resolvedUrl = server.resolvedUrls?.local[0]
  if (!resolvedUrl) throw new Error('preview server produced no URL')
  const url: string = resolvedUrl

  const executablePath = preinstalledChromium()
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  // One context = one origin storage. Pages come and go; IndexedDB stays —
  // exactly the browser's own kill-and-reopen behaviour.
  const context = await newContext(browser)

  try {
    console.log('\nSESSION — log sets, then kill the tab without warning')
    const page = await openApp(context, url)

    await page.getByRole('button', { name: 'Start session' }).click()
    await page.getByRole('button', { name: /^Log set 1$/ }).waitFor()

    // Exercise 1: incline press. Type the opening weight, then log two sets.
    await typeIntoStepper(page, 'Weight', '185')
    await page.getByRole('button', { name: 'Log set 1' }).click()
    await page.getByRole('button', { name: /^Log set 2$/ }).waitFor()
    await page.getByRole('button', { name: 'Dismiss' }).click()

    await page.getByRole('button', { name: 'Decrease Reps' }).click()
    await page.getByRole('button', { name: 'Log set 2' }).click()
    await page.getByRole('button', { name: /^Log set 3$/ }).waitFor()
    await page.getByRole('button', { name: 'Dismiss' }).click()

    // Move to exercise 2 and log one set there.
    await page.getByRole('button', { name: 'Next ›' }).click()
    await page.getByText('Exercise 2 of 5').waitFor()
    await typeIntoStepper(page, 'Weight', '200')
    await page.getByRole('button', { name: 'Log set 1' }).click()
    await page.getByRole('button', { name: /^Log set 2$/ }).waitFor()

    await page.screenshot({ path: resolve(OUT_DIR, 'resume-before-kill.png') })
    const before = {
      progress: await page.getByText('Exercise 2 of 5').count(),
      loggedRow: await page.getByText('200 × 8').count(),
    }
    check('mid-session state reached: exercise 2, set 200 × 8 logged', before.progress === 1 && before.loggedRow === 1)

    // The kill. No beforeunload, no cleanup, no chance to flush anything.
    await page.close({ runBeforeUnload: false })
    console.log('  → page killed')

    console.log('\nREOPEN — a fresh page against the same origin storage')
    const revived = await openApp(context, url)

    const resumeButton = revived.getByRole('button', { name: 'Resume session' })
    check('home offers "Resume session"', (await resumeButton.count()) === 1)
    await revived.screenshot({ path: resolve(OUT_DIR, 'resume-home.png') })

    await resumeButton.click()
    await revived.getByText(/Exercise \d of 5/).waitFor()

    check(
      'resumes on exercise 2 — the one being trained when killed',
      (await revived.getByText('Exercise 2 of 5').count()) === 1,
    )
    check(
      'exercise 2’s set survived: 200 × 8 rendered from the database',
      (await revived.getByText('200 × 8').count()) === 1,
    )
    check(
      'next set numbering continues: "Log set 2"',
      (await revived.getByRole('button', { name: 'Log set 2' }).count()) === 1,
    )

    // Walk back to exercise 1 and confirm both its sets are intact too.
    await revived.getByRole('button', { name: '‹ Previous' }).click()
    await revived.getByText('Exercise 1 of 5').waitFor()
    check(
      'exercise 1’s sets survived: 185 × 8 and 185 × 7',
      (await revived.getByText('185 × 8').count()) === 1 &&
        (await revived.getByText('185 × 7').count()) === 1,
    )
    await revived.screenshot({ path: resolve(OUT_DIR, 'resume-after-kill.png') })

    console.log('\nCOMPLETE — drive the resumed session through cardio to done')
    // Log one more set so the rest timer is on screen for its screenshot.
    await revived.getByRole('button', { name: 'Log set 3' }).click()
    await revived.getByRole('button', { name: 'Dismiss' }).waitFor()
    await revived.screenshot({ path: resolve(OUT_DIR, 'session-rest-timer.png') })
    check(
      'rest timer appears on logging and shows the full countdown',
      (await revived.getByText('2:30').count()) === 1,
    )
    await revived.getByRole('button', { name: 'Dismiss' }).click()
    check(
      'rest timer dismisses with one tap',
      (await revived.getByRole('button', { name: 'Dismiss' }).count()) === 0,
    )

    // Walk to the cardio step and finish: four Next taps to exercise 5, then
    // the final button reads "Cardio ›".
    for (let i = 0; i < 5; i += 1) {
      await revived.getByRole('button', { name: /Next ›|Cardio ›/ }).click()
    }
    await revived.getByText('Incline walk').waitFor()
    check(
      'cardio pre-filled with 45 min',
      (await revived.getByRole('button', { name: /^Duration: 45 min/ }).count()) === 1,
    )
    await revived.screenshot({ path: resolve(OUT_DIR, 'session-cardio.png') })

    await revived.getByRole('button', { name: 'Finish session' }).click()
    await revived.getByText('Session complete').waitFor()
    check(
      'home shows the completed state with the set count',
      (await revived.getByText(/4 sets/).count()) === 1,
    )
    await revived.screenshot({ path: resolve(OUT_DIR, 'session-complete.png') })

    console.log(
      failures === 0
        ? '\nRESULT: a killed tab loses nothing — the session resumes exactly where it was.'
        : `\nRESULT: ${failures} check(s) FAILED.`,
    )
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
