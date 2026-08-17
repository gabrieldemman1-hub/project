/**
 * The Phase 7 gate: airplane mode and the backup round trip, in a real
 * browser against the real production build.
 *
 *   npm run build && npm run prove-offline
 *
 * Proves the chain the brief demands: the service worker precaches the app on
 * first visit; with the network cut the app still opens, every screen still
 * loads (lazy chart chunk included), and a workout can still be logged; a
 * backup can be exported offline and holds the day's data; and a wiped phone
 * restored from that file shows the same history again. Ends with the wrong
 * file being rejected loudly.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from '@playwright/test'
import { preview } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(here, '../screenshots')
const SCRATCH = resolve(here, '../node_modules/.prove-offline')

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
  mkdirSync(SCRATCH, { recursive: true })
  const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'warn' })
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
    acceptDownloads: true,
  })

  async function open(): Promise<Page> {
    const page = await context.newPage()
    // A Wednesday evening: Day C, mid-week, mid-block.
    await page.clock.setFixedTime(new Date('2026-08-19T18:30:00'))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => (document.querySelector('main')?.textContent?.length ?? 0) > 0,
    )
    return page
  }

  try {
    console.log('\nINSTALL — the worker takes over and the manifest is served')
    const page = await open()

    // serviceWorker.ready resolves only after the install step — the full
    // precache — has finished, so from here the network is optional.
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    check('the service worker is installed, precached and controlling the page', true)

    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
      if (!link) return null
      const response = await fetch(link.href)
      return response.ok ? ((await response.json()) as Record<string, unknown>) : null
    })
    check(
      'the manifest is linked, fetches, and declares a standalone app with icons',
      manifest !== null &&
        manifest['display'] === 'standalone' &&
        Array.isArray(manifest['icons']) &&
        manifest['icons'].length === 3,
    )
    const iconOk = await page.evaluate(async () => {
      const response = await fetch('icons/icon-192.png')
      return response.ok && (response.headers.get('content-type') ?? '').includes('png')
    })
    check('the 192px icon actually serves', iconOk)

    console.log('\nAIRPLANE MODE — the network dies; the app does not')
    await context.setOffline(true)
    await page.reload({ waitUntil: 'commit' })
    await page.getByRole('button', { name: 'Open today’s workout' }).waitFor()
    check('the app reloads with no network at all', true)
    check(
      'the dashboard board renders offline',
      (await page.getByText('This week').count()) === 1,
    )
    await page.screenshot({ path: resolve(OUT_DIR, 'offline-dashboard.png') })

    // The lazy-loaded chart chunk is the file most likely to be forgotten by
    // a precache list; opening History offline is the proof it wasn't.
    await page.getByRole('button', { name: 'History' }).click()
    // A fresh seed has no completed sessions, so the empty state is what
    // renders — reaching it still requires the 378 kB lazy chunk to load.
    await page.getByText('Nothing yet').waitFor()
    check('history — the lazily-loaded chart code — opens offline', true)
    await page.goBack()
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByText('Exercise library').waitFor()
    check('settings opens offline', true)
    await page.getByRole('button', { name: '‹ Home' }).click()

    console.log('\nLOGGING OFFLINE — a set of data written with no connection')
    await page.getByRole('button', { name: 'Open today’s workout' }).click()
    await page.getByRole('button', { name: 'Skip today' }).click()
    await page.getByText('Skipped', { exact: false }).first().waitFor()
    await page.getByRole('button', { name: '‹ Dashboard' }).click()
    await page.getByText('Skipped today').waitFor()
    check('a training decision logs to the database while offline', true)

    console.log('\nBACKUP — exported offline, and it holds the data')
    await page.getByRole('button', { name: 'Settings' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export backup' }).click()
    const download = await downloadPromise
    const backupPath = resolve(SCRATCH, 'backup.json')
    await download.saveAs(backupPath)
    const backup = JSON.parse(readFileSync(backupPath, 'utf8')) as {
      format: string
      data: { sessions: Array<{ status: string }>; sets: unknown[] }
    }
    check(
      'the exported file is a complete backup holding the offline-logged day',
      backup.format === 'workout-tracker-backup' &&
        backup.data.sessions.length === 1 &&
        backup.data.sessions[0]?.status === 'skipped',
    )
    check(
      'the export is recorded, so the 30-day nudge resets',
      (await page.getByText('Last backup: Wednesday 19 August').count()) === 1,
    )

    console.log('\nRESTORE — a wiped phone gets its history back from the file')
    // Back to the front door first: a reload keeps the hash route, and the
    // assertions below read the dashboard.
    await page.getByRole('button', { name: '‹ Home' }).click()
    await page.getByRole('button', { name: 'Open today’s workout' }).waitFor()
    // The nuclear scenario: the database is gone entirely. Still offline.
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const request = indexedDB.deleteDatabase('workout-tracker')
          request.onsuccess = () => done()
          request.onerror = () => done()
          // Blocked just means the page still holds its connection; the
          // delete completes once the reload below closes it.
          request.onblocked = () => done()
        }),
    )
    await page.reload({ waitUntil: 'commit' })
    await page.getByRole('button', { name: 'Open today’s workout' }).waitFor()
    check(
      'a fresh database reseeds offline — and the skipped day is gone',
      (await page.getByText('Skipped today').count()) === 0,
    )

    await page.getByRole('button', { name: 'Settings' }).click()
    await page
      .getByLabel('Choose a backup file to restore')
      .setInputFiles(backupPath)
    await page.getByText('Replace everything on this phone').waitFor()
    check('the restore confirms before touching anything', true)
    await page.getByText('Replace everything on this phone').scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(OUT_DIR, 'restore-confirm.png') })
    await page.getByRole('button', { name: 'Replace everything' }).click()
    await page.getByText('Restored: 1 session, 0 sets').waitFor()
    await page.getByRole('button', { name: '‹ Home' }).click()
    await page.getByText('Skipped today').waitFor()
    check('the restored history is live: the skipped day is back', true)

    console.log('\nWRONG FILE — rejected loudly, nothing touched')
    const junkPath = resolve(SCRATCH, 'junk.json')
    writeFileSync(junkPath, JSON.stringify({ some: 'other json' }), 'utf8')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByLabel('Choose a backup file to restore').setInputFiles(junkPath)
    await page.getByText('not a workout backup').waitFor()
    check('a non-backup JSON file is refused with a plain-English error', true)
    await page.getByRole('button', { name: '‹ Home' }).click()
    await page.getByRole('button', { name: 'Open today’s workout' }).waitFor()
    check(
      'and the data survives the attempt',
      (await page.getByText('Skipped today').count()) === 1,
    )

    console.log(
      failures === 0
        ? '\nRESULT: offline and backup both hold.'
        : `\nRESULT: ${failures} FAILED.`,
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
