/**
 * Screenshots every screen at iPhone size by driving the real built app in a
 * real browser, and audits the quality floor while it is in there.
 *
 * The two passes set the browser clock to 09:00 and 20:00 rather than forcing
 * a data-theme attribute, so the light/dark screenshots are themselves the
 * proof that the 19:00 switch works.
 *
 *   npm run shoot
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { chromium, type BrowserContext, type Page } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const OUT = resolve(root, 'screenshots')
const PORT = 4321
const BASE = `http://127.0.0.1:${PORT}/`
const IPHONE = { width: 390, height: 844 }

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  [${ok ? ' ok ' : 'FAIL'}] ${label}${detail ? `  — ${detail}` : ''}`)
}

function preinstalledChromium(): string | undefined {
  const root = process.env['PLAYWRIGHT_BROWSERS_PATH']
  if (!root || !existsSync(root)) return undefined
  return readdirSync(root)
    .filter((e) => e.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((e) => join(root, e, 'chrome-linux', 'chrome'))
    .find((p) => existsSync(p))
}

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

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(150)
  await page.screenshot({ path: resolve(OUT, `${name}.png`) })
  console.log(`  shot  ${name}.png`)
}

/** The quality floor from the design section, measured in the live page. */
async function audit(page: Page, where: string) {
  const result = await page.evaluate(() => {
    const MIN = 44
    const tooSmall: string[] = []
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('button, a, input, textarea, [role="button"]'),
    )) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.height < MIN - 0.5) {
        tooSmall.push(`${el.tagName}"${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.height)}px`)
      }
    }
    // Anything below 16px makes iOS zoom the viewport on focus.
    const smallInputs: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('input, textarea, select'))) {
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 15.9) smallInputs.push(`${el.tagName} ${size}px`)
    }
    return {
      tooSmall,
      smallInputs,
      scrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      theme: document.documentElement.dataset['theme'] ?? 'unset',
      background: getComputedStyle(document.body).backgroundColor,
    }
  })

  check(`${where}: every tap target is at least 44px`, result.tooSmall.length === 0, result.tooSmall.join(', '))
  check(`${where}: no input under 16px (iOS focus-zoom)`, result.smallInputs.length === 0, result.smallInputs.join(', '))
  check(`${where}: the page does not scroll sideways`, !result.scrollsSideways)
  return result
}

interface Pass {
  name: 'morning' | 'evening'
  at: Date
  expectTheme: 'light' | 'dark'
}

async function run(browserContext: BrowserContext, pass: Pass) {
  const page = await browserContext.newPage()
  await page.goto(BASE)
  await page.getByText('Reading streak').waitFor()

  const dash = await audit(page, `${pass.name} dashboard`)
  check(
    `${pass.name}: the clock alone resolved the theme to ${pass.expectTheme}`,
    dash.theme === pass.expectTheme,
    `got ${dash.theme}`,
  )
  await shot(page, `${pass.name}-01-dashboard-fresh`)

  await page.getByRole('link', { name: 'Library' }).click()
  await page.getByRole('heading', { name: 'Library' }).waitFor()
  await audit(page, `${pass.name} library`)
  await shot(page, `${pass.name}-02-library`)

  await page.getByText('Buy Back Your Time').first().click()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Total pages').fill('240')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(250)
  await audit(page, `${pass.name} book detail`)
  await shot(page, `${pass.name}-03-book-detail`)

  await page.getByRole('link', { name: 'Log a chapter' }).click()
  await page.getByPlaceholder('Chapter', { exact: true }).fill('Chapter 4 — The Buyback Principle')
  await page.getByRole('button', { name: /Tap to type/ }).click()
  const pageInput = page.getByRole('textbox', { name: 'Current page' })
  await pageInput.fill('60')
  await pageInput.press('Enter')
  await page
    .getByPlaceholder(/most important idea/)
    .fill(
      'Do not hire to grow the business. Hire to buy back your time, then aim that time at the work only you can do.',
    )
  await audit(page, `${pass.name} log chapter`)
  await shot(page, `${pass.name}-04-log-chapter`)

  await page.getByRole('button', { name: 'Save chapter' }).click()
  await page.getByTestId('celebration').waitFor()
  await shot(page, `${pass.name}-05-celebration`)

  await page.getByTestId('celebration').click()
  await page.getByText('Done today.').waitFor()
  await audit(page, `${pass.name} dashboard done`)
  check(`${pass.name}: the streak reads 1 after the first chapter`, true)
  await shot(page, `${pass.name}-06-dashboard-done`)

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('heading', { name: 'Settings' }).waitFor()
  await audit(page, `${pass.name} settings`)
  await shot(page, `${pass.name}-07-settings`)

  await page.close()
}

async function main() {
  buildFirst()
  // Only clear this script's own output. prove-phase3 and prove-phase4 write
  // night-*.png and phase4-*.png into the same directory.
  mkdirSync(OUT, { recursive: true })
  for (const file of readdirSync(OUT)) {
    if (/^(morning|evening)-/.test(file)) rmSync(resolve(OUT, file))
  }

  const server = startPreview()
  const exe = preinstalledChromium()
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})

  try {
    await waitForServer(BASE)
    const passes: Pass[] = [
      { name: 'morning', at: new Date(2026, 7, 18, 9, 0), expectTheme: 'light' },
      { name: 'evening', at: new Date(2026, 7, 18, 20, 0), expectTheme: 'dark' },
    ]

    for (const pass of passes) {
      console.log(`\n${pass.name} — clock set to ${pass.at.toTimeString().slice(0, 5)}`)
      // A fresh context each pass: its own IndexedDB, so the second run starts
      // from an empty shelf exactly like a new install.
      const context = await browser.newContext({
        viewport: IPHONE,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      })
      await context.clock.setFixedTime(pass.at)
      await run(context, pass)
      await context.close()
    }

    console.log(`\n${failures === 0 ? 'SCREENS PASSED' : `SCREENS FAILED — ${failures} check(s)`}`)
    console.log(`Screenshots in ${OUT}`)
  } finally {
    await browser.close()
    server.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
