import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The pure core is the part this app's trustworthiness rests on. These are
 * source-text assertions rather than behavioural ones, because the property
 * being protected — "this module cannot reach the database or the clock" — is
 * about what the file is allowed to contain.
 */
const here = dirname(fileURLToPath(import.meta.url))

const PURE_MODULES = ['day.ts', 'scheduler.ts', 'streaks.ts', 'theme.ts']

function sourceOf(file: string): string | null {
  try {
    return readFileSync(resolve(here, file), 'utf8')
  } catch {
    return null // not written yet — that phase's tests will cover it
  }
}

describe('the pure core stays pure', () => {
  for (const file of PURE_MODULES) {
    const src = sourceOf(file)
    if (src === null) continue

    describe(file, () => {
      it('imports nothing from the database layer', () => {
        expect(src).not.toMatch(/from\s+['"][^'"]*\/db\//)
        expect(src).not.toMatch(/from\s+['"]dexie/)
      })

      it('imports nothing from React', () => {
        expect(src).not.toMatch(/from\s+['"]react/)
      })

      it('never reads the clock — the date is always a parameter', () => {
        const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        expect(withoutComments).not.toMatch(/Date\.now\s*\(/)
        // `new Date()` with no argument. `new Date(x)` is fine.
        expect(withoutComments).not.toMatch(/new\s+Date\s*\(\s*\)/)
      })

      it('is deterministic — no randomness', () => {
        expect(src).not.toMatch(/Math\.random/)
      })
    })
  }
})
