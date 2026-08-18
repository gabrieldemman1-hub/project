/**
 * Screenshots every screen at iPhone size, in both themes, by driving the real
 * built app in a real browser. Staging data goes through the actual UI, so a
 * screenshot run also verifies the flow it is photographing.
 *
 *   npm run build && npm run shoot
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { chromium, type Page } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const OUT = resolve(root, 'screenshots')
const PORT = 4321
const BASE = `http://127.0.0.1:${PORT}/`

const IPHONE = { width: 390, height: 844 }

/** The sandbox ships Chromium pre-installed; Playwright looks for a different build. */
function preinstalledChromium(): string | undefined {
  const root = process.env['PLAYWRIGHT_BROWSERS_PATH']
  if (!root || !existsSync(root)) return undefined
  const candidates = readdirSync(root)
    .filter((entry) => entry.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((entry) => join(root, entry, 'chrome-linux', 'chrome'))
  return candidates.find((path) => existsSync(path))
}

async function waitForServer(url: string, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Preview server never came up at ${url}`)
}

/** Always build first — `vite preview` serves dist/, and a stale dist silently
 *  photographs the previous version of the app. */
function buildFirst() {
  const res = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  if (res.status !== 0) throw new Error('build failed — not shooting a stale bundle')
}

function startPreview(): ChildProcess {
  return spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  })
}

async function shot(page: Page, name: string) {
  // Let fonts settle so type doesn't shift between the two theme passes.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(120)
  await page.screenshot({ path: resolve(OUT, `${name}.png`) })
  console.log(`  shot  ${name}.png`)
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
  }, theme)
  await page.waitForTimeout(80)
}

async function run(theme: 'light' | 'dark') {
  const exe = preinstalledChromium()
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})
  const context = await browser.newContext({
    viewport: IPHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  await page.goto(BASE)
  await page.getByRole('heading', { name: 'Library' }).waitFor()
  await setTheme(page, theme)
  await shot(page, `${theme}-01-library-fresh`)

  // Open a book and give it a page count, the way the user would.
  await page.getByText('Buy Back Your Time').first().click()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Total pages').fill('240')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(200)
  await setTheme(page, theme)
  await shot(page, `${theme}-02-book-detail`)

  // Log a chapter through the real flow.
  await page.getByRole('link', { name: 'Log a chapter' }).click()
  await page.getByPlaceholder('Chapter', { exact: true }).fill('Chapter 4 — The Buyback Principle')
  // Tap the number to switch the stepper into type mode, then enter the page.
  await page.getByRole('button', { name: /Tap to type/ }).click()
  const pageInput = page.getByRole('textbox', { name: 'Current page' })
  await pageInput.fill('60')
  await pageInput.press('Enter')
  await page
    .getByPlaceholder(/most important idea/)
    .fill(
      'Do not hire to grow the business. Hire to buy back your time, then aim that time at the work only you can do.',
    )
  await setTheme(page, theme)
  await shot(page, `${theme}-03-log-chapter`)

  await page.getByRole('button', { name: 'Save chapter' }).click()
  await page.getByTestId('celebration').waitFor()
  await setTheme(page, theme)
  await shot(page, `${theme}-04-celebration`)

  await page.waitForURL(/#\/$/, { timeout: 5000 }).catch(() => undefined)
  await page.goto(`${BASE}#/library`)
  await page.getByRole('heading', { name: 'Library' }).waitFor()
  await setTheme(page, theme)
  await shot(page, `${theme}-05-library-progress`)

  await page.getByText('Buy Back Your Time').first().click()
  await page.getByText('Chapter 4').first().waitFor()
  await setTheme(page, theme)
  await shot(page, `${theme}-06-book-with-note`)

  await browser.close()
}

async function main() {
  buildFirst()
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const server = startPreview()
  try {
    await waitForServer(BASE)
    for (const theme of ['light', 'dark'] as const) {
      console.log(`\n${theme} theme`)
      await run(theme)
    }
    console.log(`\nScreenshots in ${OUT}`)
  } finally {
    server.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
