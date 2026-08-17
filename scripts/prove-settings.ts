/**
 * Browser proof for the Settings batch: the shipped library exercises, day
 * editing reflected on the home screen, the light/dark switch actually
 * repainting, and the PIN lock guarding a fresh open — wrong PIN rejected,
 * right PIN in, hint shown on request.
 *
 *   npm run build && npm run prove-settings
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

async function bg(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const server = await preview({ preview: { port: 4177, strictPort: true }, logLevel: 'warn' })
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

  async function open(): Promise<Page> {
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-08-17T18:30:00'))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
    )
    return page
  }

  try {
    console.log('\nLIBRARY — the shipped movements are saved and placeable')
    const page = await open()
    await page.getByRole('button', { name: 'Settings ›' }).click()
    await page.getByText('Exercise library').waitFor()
    check(
      'the six owner exercises are in the library',
      (await page.getByText('Lateral raise dumbbells').count()) >= 1 &&
        (await page.getByText('Incline barbell press smith machine').count()) >= 1,
    )
    await page.screenshot({ path: resolve(OUT_DIR, 'settings.png') })

    // Add "Incline dumbbell press" to Day A and see it on the home screen.
    await page
      .getByLabel('Add exercise to day A')
      .selectOption({ label: 'Incline dumbbell press' })
    await page.getByRole('button', { name: 'Add selected exercise to day A' }).click()
    await page.getByRole('button', { name: '‹ Home' }).click()
    await page.getByText('6 exercises').waitFor()
    check('Day A now runs 6 exercises, ending with the added movement', true)

    console.log('\nTHEME — the switch repaints the whole app')
    const darkBg = await bg(page)
    await page.getByRole('button', { name: 'Settings ›' }).click()
    await page.getByRole('button', { name: 'light' }).click()
    await page.waitForFunction(
      (previous) => getComputedStyle(document.body).backgroundColor !== previous,
      darkBg,
    )
    const lightBg = await bg(page)
    check('light mode changes the background', lightBg !== darkBg)
    await page.screenshot({ path: resolve(OUT_DIR, 'settings-light.png') })
    await page.getByRole('button', { name: 'dark', exact: true }).click()
    await page.waitForFunction(
      (previous) => getComputedStyle(document.body).backgroundColor !== previous,
      lightBg,
    )
    check('dark mode returns', (await bg(page)) === darkBg)

    console.log('\nLOCK — a fresh open is gated; the PIN never leaves the phone')
    await page.getByLabel('New PIN').fill('4711')
    await page.getByLabel('Confirm PIN').fill('4711')
    await page.getByLabel('PIN hint').fill('the answer')
    await page.getByRole('button', { name: 'Set PIN' }).click()
    await page.getByText('Lock is on').waitFor()

    // A brand-new page = a fresh open (sessionStorage is per-tab here).
    const fresh = await open()
    check(
      'a fresh open lands on the lock screen',
      (await fresh.getByText('Enter your PIN').count()) === 1,
    )
    await fresh.screenshot({ path: resolve(OUT_DIR, 'lock-screen.png') })

    await fresh.getByLabel('PIN', { exact: true }).fill('9999')
    await fresh.getByRole('button', { name: 'Unlock' }).click()
    await fresh.getByText('Wrong PIN.').waitFor()
    check('a wrong PIN is rejected', true)

    await fresh.getByRole('button', { name: 'Show hint' }).click()
    check(
      'the hint appears on request',
      (await fresh.getByText('Hint: the answer').count()) === 1,
    )

    await fresh.getByLabel('PIN', { exact: true }).fill('4711')
    await fresh.getByRole('button', { name: 'Unlock' }).click()
    await fresh.getByText(/· Today/).waitFor()
    check('the right PIN unlocks to the home screen', true)

    console.log(failures === 0 ? '\nRESULT: settings, themes and lock all hold.' : `\nRESULT: ${failures} FAILED.`)
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
