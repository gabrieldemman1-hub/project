/**
 * Phase 2 gate, extended through Phase 4: "kill the tab mid-session, reopen,
 * and prove the session resumes with the logged sets intact" — now with the
 * soreness check-in, the engine's recommendation on screen, and the
 * pump/RIR/joint-pain feedback flow in the loop.
 *
 * Drives the real production build in a real Chromium at iPhone size, and
 * captures the feedback screens as the Phase 4 gate screenshots.
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

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`) })
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
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })

  async function openApp(): Promise<Page> {
    const page = await context.newPage()
    await page.clock.setFixedTime(FROZEN_DATE)
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
    )
    return page
  }

  try {
    console.log('\nCHECK-IN — the soreness questions come before any lifting')
    const page = await openApp()
    await page.getByRole('button', { name: 'Start session' }).click()

    await page.getByText('How sore is your chest').waitFor()
    await shot(page, 'feedback-soreness')
    check('soreness asked for the chest first', true)
    await page.getByRole('button', { name: 'Not sore' }).click()
    await page.getByText('How sore is your triceps').waitFor()
    await page.getByRole('button', { name: 'Not sore' }).click()

    console.log('\nRECOMMENDATION — the engine explains itself on the exercise')
    await page.getByText(/First time — pick a weight/).waitFor()
    check(
      'first-time sentence shown with 3 planned sets',
      (await page.getByRole('button', { name: 'Log set 1 of 3' }).count()) === 1,
    )
    await shot(page, 'session-recommendation')

    console.log('\nSESSION — log sets, then kill the tab without warning')
    await typeIntoStepper(page, 'Weight', '185')
    await page.getByRole('button', { name: 'Log set 1 of 3' }).click()
    await page.getByRole('button', { name: 'Dismiss' }).waitFor()
    check('rest timer counts down from 2:30', (await page.getByText('2:30').count()) === 1)
    await shot(page, 'session-rest-timer')
    await page.getByRole('button', { name: 'Dismiss' }).click()

    await page.getByRole('button', { name: 'Decrease Reps' }).click()
    await page.getByRole('button', { name: 'Log set 2 of 3' }).click()
    await page.getByRole('button', { name: 'Dismiss' }).click()

    // Leaving with sets logged but no feedback: the questions intercept.
    await page.getByRole('button', { name: 'Next ›' }).click()
    await page.getByText('How was the pump?').waitFor()
    await shot(page, 'feedback-pump')
    await page.getByRole('button', { name: 'Moderate' }).click()
    await page.getByText('Reps left in the tank').waitFor()
    await shot(page, 'feedback-rir')
    await page.getByRole('button', { name: '2', exact: true }).click()
    await page.getByText('Any joint pain?').waitFor()
    await shot(page, 'feedback-joint-pain')
    await page.getByRole('button', { name: 'No', exact: true }).click()
    await page.getByText('Exercise 2 of 5').waitFor()
    check('feedback flow lands on exercise 2', true)

    await typeIntoStepper(page, 'Weight', '200')
    await page.getByRole('button', { name: 'Log set 1 of 3' }).click()
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await shot(page, 'resume-before-kill')

    // The kill. No beforeunload, no cleanup, no chance to flush anything.
    await page.close({ runBeforeUnload: false })
    console.log('  → page killed')

    console.log('\nREOPEN — a fresh page against the same origin storage')
    const revived = await openApp()
    const resumeButton = revived.getByRole('button', { name: 'Resume session' })
    check('home offers "Resume session"', (await resumeButton.count()) === 1)
    await resumeButton.click()
    await revived.getByText(/Exercise \d of 5/).waitFor()

    check(
      'resumes on exercise 2 — no re-asking the soreness questions',
      (await revived.getByText('Exercise 2 of 5').count()) === 1,
    )
    check(
      'exercise 2’s set survived: 200 × 8',
      (await revived.getByText('200 × 8').count()) === 1,
    )
    check(
      'set numbering continues: "Log set 2 of 3"',
      (await revived.getByRole('button', { name: 'Log set 2 of 3' }).count()) === 1,
    )

    await revived.getByRole('button', { name: '‹ Previous' }).click()
    await revived.getByText('Exercise 1 of 5').waitFor()
    check(
      'exercise 1’s sets survived: 185 × 8 and 185 × 7',
      (await revived.getByText('185 × 8').count()) === 1 &&
        (await revived.getByText('185 × 7').count()) === 1,
    )
    await shot(revived, 'resume-after-kill')

    // Exercise 1 already gave feedback — moving on must NOT re-ask.
    await revived.getByRole('button', { name: 'Next ›' }).click()
    await revived.getByText('Exercise 2 of 5').waitFor()
    check(
      'answered feedback is never re-asked',
      (await revived.getByText('How was the pump?').count()) === 0,
    )

    console.log('\nCOMPLETE — finish exercise 2; its last planned set asks by itself')
    await revived.getByRole('button', { name: 'Log set 2 of 3' }).click()
    await revived.getByRole('button', { name: 'Dismiss' }).click()
    await revived.getByRole('button', { name: 'Log set 3 of 3' }).click()
    await revived.getByText('How was the pump?').waitFor()
    check('logging the last planned set triggers the questions automatically', true)
    await revived.getByRole('button', { name: 'Great' }).click()
    await revived.getByRole('button', { name: '2', exact: true }).click()
    // The joint-pain question is dismissible — use the skip this time.
    await revived.getByRole('button', { name: 'Skip' }).click()
    await revived.getByRole('button', { name: 'Dismiss' }).click()

    for (let i = 0; i < 4; i += 1) {
      await revived.getByRole('button', { name: /Next ›|Cardio ›/ }).click()
    }
    await revived.getByText('Incline walk').waitFor()
    check(
      'cardio pre-filled with 45 min',
      (await revived.getByRole('button', { name: /^Duration: 45 min/ }).count()) === 1,
    )
    await shot(revived, 'session-cardio')

    await revived.getByRole('button', { name: 'Finish session' }).click()
    await revived.getByText('Session complete').waitFor()
    check(
      'home shows the completed state with the set count',
      (await revived.getByText(/5 sets/).count()) === 1,
    )
    await shot(revived, 'session-complete')

    console.log(
      failures === 0
        ? '\nRESULT: check-in, recommendations, feedback, kill, resume and completion all hold together.'
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
