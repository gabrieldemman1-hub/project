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

/** iPhone 12/13/14 logical viewport — the size the brief asks screenshots at. */
const VIEWPORT = { width: 390, height: 844 }

interface Device {
  label: string
  width: number
  height: number
  /**
   * Safe-area insets to simulate. A desktop Chromium always reports zero for
   * env(safe-area-inset-*), so without this the notch and home indicator are
   * invisible in testing and only show up on the real phone.
   */
  insets: { top: number; bottom: number }
}

/**
 * The phones this actually has to work on. The narrow/short SE is where
 * layouts break; the tall Pro Max is where a fixed-height shell can leave a
 * gap; the notched sizes are where safe-area handling shows up.
 */
const DEVICES: Device[] = [
  { label: 'iPhone SE', width: 375, height: 667, insets: { top: 20, bottom: 0 } },
  { label: 'iPhone 13 mini', width: 375, height: 812, insets: { top: 50, bottom: 34 } },
  { label: 'iPhone 14', width: 390, height: 844, insets: { top: 47, bottom: 34 } },
  {
    label: 'iPhone 15 Pro Max',
    width: 430,
    height: 932,
    insets: { top: 59, bottom: 34 },
  },
]

interface Shot {
  name: string
  /** Frozen clock, so the screenshot is of a known day rather than "whenever". */
  date: string
  label: string
  /** Route to shoot: '' is the dashboard, '#/today' the day's plan. */
  hash: string
}

const SHOTS: Shot[] = [
  { name: 'dashboard', date: '2026-08-17T09:00:00', label: 'Monday — dashboard', hash: '' },
  { name: 'home-training-day', date: '2026-08-17T09:00:00', label: 'Monday — Day A', hash: '#/today' },
  { name: 'dashboard-rest', date: '2026-08-23T09:00:00', label: 'Sunday — dashboard', hash: '' },
  { name: 'home-rest-day', date: '2026-08-23T09:00:00', label: 'Sunday — rest day', hash: '#/today' },
]

/** Overrides the safe-area custom properties to stand in for a notch. */
function insetStyle(insets: Device['insets']): string {
  return `:root{--safe-top:${insets.top}px;--safe-bottom:${insets.bottom}px;--safe-left:0px;--safe-right:0px}`
}

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
async function audit(page: Page, insets: Device['insets']) {
  return page.evaluate(({ top, bottom }) => {
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

    // Nothing may sit under the notch or the home indicator. Measured against
    // real text and controls, not against the CSS that is supposed to move them.
    //
    // Only the *visible* part of each element counts: the exercise list is a
    // scroll container, so rows below the fold are clipped by it rather than
    // sitting under the home indicator, and counting their raw rect would flag
    // every long list as broken.
    const scroller = document.querySelector<HTMLElement>('main')
    const scrollerBox = scroller?.getBoundingClientRect()

    let underNotch = 0
    let underHomeIndicator = 0

    for (const element of document.querySelectorAll<HTMLElement>(
      'main p, main span, button',
    )) {
      const box = element.getBoundingClientRect()
      if (box.height === 0) continue

      // Clip to the scroll container when the element lives inside it.
      const clip = scroller?.contains(element) && scrollerBox ? scrollerBox : null
      const visibleTop = clip ? Math.max(box.top, clip.top) : box.top
      const visibleBottom = clip ? Math.min(box.bottom, clip.bottom) : box.bottom
      if (visibleBottom <= visibleTop) continue // scrolled out of view

      if (visibleTop < top) underNotch += 1
      if (visibleBottom > window.innerHeight - bottom) underHomeIndicator += 1
    }

    return {
      action,
      safeArea: { underNotch, underHomeIndicator },
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
  }, insets)
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const server = await preview({
    preview: { port: 4173, strictPort: true },
    logLevel: 'warn',
  })
  const resolvedUrl = server.resolvedUrls?.local[0]
  if (!resolvedUrl) throw new Error('preview server produced no URL')
  // Bound to its own const so the narrowing survives into the closures below.
  const url: string = resolvedUrl

  const executablePath = preinstalledChromium()
  if (executablePath) console.log(`Using pre-installed Chromium: ${executablePath}`)
  const browser = await chromium.launch(
    executablePath ? { executablePath } : {},
  )

  /** Non-zero when any device fails a quality-floor check. */
  let failures = 0

  async function open(device: Device, shot: Shot) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'dark',
    })
    const page = await context.newPage()

    // Stand in for the notch and home indicator before first paint. Injected
    // unlayered, so it beats the @layer base defaults regardless of order.
    await page.addInitScript((css: string) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
      })
    }, insetStyle(device.insets))

    // Freeze the clock before any script runs so the app resolves a known day.
    await page.clock.setFixedTime(new Date(shot.date))
    await page.goto(`${url}${shot.hash}`, { waitUntil: 'networkidle' })
    // Wait for the seed and the first live query rather than a fixed delay.
    await page.waitForSelector('main', { state: 'visible' })
    await page.waitForFunction(
      () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
    )
    await page.evaluate(() => document.fonts.ready)

    return { context, page }
  }

  function report(label: string, result: Awaited<ReturnType<typeof audit>>) {
    const problems: string[] = []
    if (result.documentScrollsHorizontally) problems.push('horizontal overflow')
    if (result.documentScrollsVertically) problems.push('page scrolls')
    if (result.action.present && !result.action.withinViewport)
      problems.push('action off-screen')
    if (result.safeArea.underNotch > 0)
      problems.push(`${result.safeArea.underNotch} element(s) under the notch`)
    if (result.safeArea.underHomeIndicator > 0)
      problems.push(
        `${result.safeArea.underHomeIndicator} element(s) under the home indicator`,
      )
    if (result.tooSmall.length > 0)
      problems.push(
        `touch targets under 44px: ${result.tooSmall
          .map((t) => `"${t.text}"`)
          .join(', ')}`,
      )
    if (!result.tabularFigures) problems.push('digits are not tabular')
    if (result.glowing > 2) problems.push(`${result.glowing} glowing elements`)

    if (problems.length === 0) {
      console.log(`  ✓ ${label}`)
    } else {
      failures += 1
      console.log(`  ✗ ${label} — ${problems.join('; ')}`)
    }
  }

  try {
    // The brief's reference size, captured to disk.
    const reference =
      DEVICES.find((d) => d.width === VIEWPORT.width && d.height === VIEWPORT.height) ??
      DEVICES[0]
    if (!reference) throw new Error('no devices configured')

    for (const shot of SHOTS) {
      const { context, page } = await open(reference, shot)
      const file = resolve(OUT_DIR, `${shot.name}.png`)
      await page.screenshot({ path: file })

      const result = await audit(page, reference.insets)
      console.log(`\n${shot.label}  →  screenshots/${shot.name}.png`)
      console.log(
        `  ${reference.label} ${reference.width}×${reference.height}, safe area ${reference.insets.top}px top / ${reference.insets.bottom}px bottom`,
      )
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
        `  clears notch / bar     ${
          result.safeArea.underNotch === 0 && result.safeArea.underHomeIndicator === 0
            ? 'yes'
            : `NO — ${result.safeArea.underNotch} under notch, ${result.safeArea.underHomeIndicator} under home indicator`
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

    // Then sweep every phone size this actually has to survive.
    console.log('\nDevice sweep')
    for (const device of DEVICES) {
      for (const shot of SHOTS) {
        const { context, page } = await open(device, shot)
        const result = await audit(page, device.insets)
        report(
          `${device.label.padEnd(18)} ${String(device.width).padStart(3)}×${device.height}  ${shot.label}`,
          result,
        )
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }

  console.log()
  if (failures > 0) {
    console.error(`${failures} device/screen combination(s) failed the quality floor.`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
