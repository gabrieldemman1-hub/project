/**
 * Generates the PWA install assets into `public/`: the app icons and the web
 * app manifest.
 *
 *   npm run make-pwa-assets
 *
 * The icons are rendered from an inline SVG in a real Chromium and
 * screenshotted at each required size, because this container has no image
 * tooling and the design must come from tokens.ts like every other visual in
 * the app. The manifest is generated for the same reason: its colours must not
 * drift from the tokens. Outputs are committed, so this only needs re-running
 * when the icon design or the tokens change.
 *
 * Sizes: 192 and 512 for the manifest, a full-bleed 512 for Android's
 * maskable purpose (mark kept inside the central 80% safe zone), and 180 for
 * iOS's apple-touch-icon.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

import { colors } from '../src/styles/tokens.ts'

const here = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(here, '../public')
const ICONS = resolve(PUBLIC, 'icons')

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

/**
 * The mark: a barbell — bar, inner plates, outer plates — in the accent red
 * on the app's near-black, with a soft glow coming from the bar, matching the
 * in-app design language. `scale` shrinks the mark toward the centre for the
 * maskable icon's safe zone.
 */
function iconSvg(size: number, scale: number): string {
  const s = (n: number) => (n * size * scale) / 512
  const cx = size / 2
  const cy = size / 2
  const barHalf = s(190)
  const barThickness = s(28)
  const plate = (offset: number, halfHeight: number, width: number) => {
    const x = s(offset)
    return (
      `<rect x="${cx - x - width / 2}" y="${cy - halfHeight}" width="${width}" height="${halfHeight * 2}" rx="${s(14)}" fill="${colors.accent}"/>` +
      `<rect x="${cx + x - width / 2}" y="${cy - halfHeight}" width="${width}" height="${halfHeight * 2}" rx="${s(14)}" fill="${colors.accent}"/>`
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${s(18)}" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" fill="${colors.bg}"/>
  <g filter="url(#glow)">
    <rect x="${cx - barHalf}" y="${cy - barThickness / 2}" width="${barHalf * 2}" height="${barThickness}" rx="${barThickness / 2}" fill="${colors.accent}"/>
    ${plate(120, s(96), s(40))}
    ${plate(168, s(64), s(32))}
  </g>
</svg>`
}

const MANIFEST = {
  name: 'Workout',
  short_name: 'Workout',
  description: 'Personal hypertrophy training log. Offline-first, on-device only.',
  // Relative, so the same manifest works at any base path — locally at / and
  // on GitHub Pages at /project/.
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: colors.bg,
  theme_color: colors.bg,
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    {
      src: 'icons/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
}

async function main(): Promise<void> {
  mkdirSync(ICONS, { recursive: true })

  const executablePath = preinstalledChromium()
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  const page = await browser.newPage()

  const targets: Array<{ file: string; size: number; scale: number }> = [
    { file: 'icon-192.png', size: 192, scale: 1 },
    { file: 'icon-512.png', size: 512, scale: 1 },
    // Maskable: Android crops up to ~20% from each edge, so the mark shrinks
    // into the central safe zone while the background bleeds to the corners.
    { file: 'icon-maskable-512.png', size: 512, scale: 0.72 },
    { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  ]

  for (const { file, size, scale } of targets) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<body style="margin:0">${iconSvg(size, scale)}</body>`,
    )
    await page.screenshot({ path: resolve(ICONS, file) })
    console.log(`  ✓ icons/${file} (${size}×${size})`)
  }
  await browser.close()

  writeFileSync(
    resolve(PUBLIC, 'manifest.webmanifest'),
    JSON.stringify(MANIFEST, null, 2) + '\n',
    'utf8',
  )
  console.log('  ✓ manifest.webmanifest')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
