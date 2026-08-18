import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DARK, LIGHT, contrast, toCss, type Palette } from './tokens'

const here = dirname(fileURLToPath(import.meta.url))

describe('tokens.css', () => {
  it('is in sync with tokens.ts — run `npm run make-tokens` if this fails', () => {
    const onDisk = readFileSync(resolve(here, 'tokens.css'), 'utf8')
    expect(onDisk).toBe(toCss())
  })
})

/**
 * Contrast audit. The app is read in bed at night and in daylight, so both
 * themes have to clear WCAG AA. 4.5:1 for body text, 3:1 for large text.
 */
const AA_TEXT = 4.5
const AA_LARGE = 3

function audit(name: string, p: Palette) {
  describe(`${name} theme contrast`, () => {
    const bodyPairs: Array<[string, string, string]> = [
      ['ink on ground', p.ink, p.ground],
      ['ink on surface', p.ink, p.surface],
      ['ink on surfaceSunk', p.ink, p.surfaceSunk],
      ['inkQuiet on ground', p.inkQuiet, p.ground],
      ['inkQuiet on surface', p.inkQuiet, p.surface],
      ['accentInk on ground', p.accentInk, p.ground],
      ['accentInk on surface', p.accentInk, p.surface],
      ['good on surface', p.good, p.surface],
      ['warn on surface', p.warn, p.surface],
      ['good on ground', p.good, p.ground],
      ['warn on ground', p.warn, p.ground],
      ['onAccent on the accent fill', p.onAccent, p.accent],
    ]

    for (const [label, fg, bg] of bodyPairs) {
      it(`${label} clears ${AA_TEXT}:1`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT)
      })
    }

    // The streak number and other display type only need the large-text bar.
    for (const [label, bg] of [
      ['ground', p.ground],
      ['surface', p.surface],
      ['surfaceSunk', p.surfaceSunk],
    ] as const) {
      it(`accent on ${label} clears the large-text bar`, () => {
        expect(contrast(p.accent, bg)).toBeGreaterThanOrEqual(AA_LARGE)
      })

      it(`inkFaint on ${label} clears the large-text bar`, () => {
        expect(contrast(p.inkFaint, bg)).toBeGreaterThanOrEqual(AA_LARGE)
      })
    }

    it('the border is visible against its surface', () => {
      expect(contrast(p.border, p.surface)).toBeGreaterThan(1.05)
    })
  })
}

audit('light', LIGHT)
audit('dark', DARK)

describe('the accent rule', () => {
  it('is one hue — the amber is warm in both themes', () => {
    // Both accents sit in the orange band of the hue circle.
    for (const hex of [LIGHT.accent, DARK.accent, LIGHT.accentInk, DARK.accentInk]) {
      const n = parseInt(hex.slice(1), 16)
      const r = (n >> 16) & 255
      const g = (n >> 8) & 255
      const b = n & 255
      expect(r).toBeGreaterThan(g)
      expect(g).toBeGreaterThan(b)
    }
  })
})
