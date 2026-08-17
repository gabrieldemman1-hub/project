/**
 * Phase gate: screenshots the app at 390×844 (iPhone 12/13/14 logical size) and
 * measures the Part 7 quality floor while the page is open.
 *
 *   npm run build && npm run screenshot
 *
 * Serves the production build rather than the dev server so the screenshot is
 * of what actually ships.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from '@playwright/test'
import { preview } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(here, '../screenshots')

/** iPhone 12/13/14 logical viewport, per the brief. */
const VIEWPORT = { width: 390, height: 844 }

interface Shot {
  name: string
  /** Frozen clock, so the screenshot is of a known day rather than "whenever". */
  date: string
  label: string
}

const SHOTS: Shot[] = [
  { name: 'home-training-day', date: '2026-08-17T09:00:00', label: 'Monday — Day A' },
  { name: 'home-rest-day', date: '2026-08-23T09:00:00', label: 'Sunday — rest day' },
]

/**
 * Finds a Chromium already on the machine whose revision does not match the one
 * this Playwright version bundles.
 *
 * Returns undefined when nothing is found, in which case Playwright resolves
 * its own browser as normal — so this is a fallback for pre-provisioned CI
 * images, not something a developer running `npm run screenshot` locally hits.
 */
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

/** Measures the Part 7 quality floor in the live page. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const MIN_TOUCH_PX = 44

    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>('button, a, input, [role="button"]'),
    )
    const tooSmall = interactive
      .map((element) => {
        const { width, height } = element.getBoundingClientRect()
        return { text: element.textContent?.trim().slice(0, 30) ?? '', width, height }
      })
      .filter(({ width, height }) => width > 0 && (height < MIN_TOUCH_PX || width < MIN_TOUCH_PX))

    // Count elements actually carrying a glow — Part 7 allows at most two per screen.
    const glowing = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
      (element) => {
        const shadow = getComputedStyle(element).boxShadow
        return shadow !== 'none' && shadow.includes('rgb')
      },
    ).length

    // Tabular figures: every digit must occupy the same width or the rest timer
    // will jitter as it counts down.
    const probe = document.createElement('span')
    probe.className = 'num'
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.fontSize = '48px'
    document.body.appendChild(probe)
    const digitWidths = '0123456789'.split('').map((digit) => {
      probe.textContent = digit
      return probe.getBoundingClientRect().width
    })
    probe.remove()
    const tabularFigures = new Set(digitWidths.map((w) => w.toFixed(2))).size === 1

    // The primary action must sit inside the viewport without scrolling —
    // Part 7 puts it in the bottom third, where the thumb is.
    const actionBar = document.querySelector<HTMLElement>('[data-screen-action]')
    const actionBox = actionBar?.getBoundingClientRect() ?? null
    const action = actionBox
      ? {
          present: true,
          withinViewport: actionBox.bottom <= window.innerHeight + 1,
          bottomThird: actionBox.top >= (window.innerHeight * 2) / 3,
        }
      : { present: false, withinViewport: false, bottomThird: false }

    return {
      action,
      documentScrollsVertically:
        document.documentElement.scrollHeight > document.documentElement.clientHeight,
      documentScrollsHorizontally:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      tooSmall,
      glowing,
      tabularFigures,
      digitWidths,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    }
  })
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const server = await preview({
    preview: { port: 4173, strictPort: true },
    logLevel: 'warn',
  })
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('preview server produced no URL')

  const executablePath = preinstalledChromium()
  if (executablePath) console.log(`Using pre-installed Chromium: ${executablePath}`)
  const browser = await chromium.launch(
    executablePath ? { executablePath } : {},
  )

  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'dark',
      })
      const page = await context.newPage()

      // Freeze the clock before any script runs so the app resolves a known day.
      await page.clock.setFixedTime(new Date(shot.date))
      await page.goto(url, { waitUntil: 'networkidle' })
      // Wait for the seed and the first live query rather than a fixed delay.
      await page.waitForSelector('main', { state: 'visible' })
      await page.waitForFunction(
        () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
      )
      await page.evaluate(() => document.fonts.ready)

      const file = resolve(OUT_DIR, `${shot.name}.png`)
      await page.screenshot({ path: file })

      const result = await audit(page)
      console.log(`\n${shot.label}  →  screenshots/${shot.name}.png`)
      console.log(`  viewport               ${VIEWPORT.width}×${VIEWPORT.height}`)
      console.log(`  body background        ${result.bodyBackground}`)
      console.log(
        `  tabular figures        ${result.tabularFigures ? 'yes' : 'NO — digits vary in width'}`,
      )
      console.log(`  glowing elements       ${result.glowing} (Part 7 allows ≤ 2)`)
      console.log(
        `  page scroll            ${
          result.documentScrollsHorizontally
            ? 'HORIZONTAL — layout overflows'
            : result.documentScrollsVertically
              ? 'VERTICAL — the shell should scroll, not the page'
              : 'none — the shell owns scrolling'
        }`,
      )
      console.log(
        `  primary action         ${
          !result.action.present
            ? 'none on this screen'
            : !result.action.withinViewport
              ? 'OFF-SCREEN — pushed below the fold'
              : result.action.bottomThird
                ? 'visible, in the bottom third'
                : 'visible, but above the bottom third'
        }`,
      )
      console.log(
        `  touch targets < 44px   ${
          result.tooSmall.length === 0
            ? 'none'
            : result.tooSmall
                .map((t) => `"${t.text}" ${Math.round(t.width)}×${Math.round(t.height)}`)
                .join(', ')
        }`,
      )

      await context.close()
    }
  } finally {
    await browser.close()
    await server.close()
  }
  console.log()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
