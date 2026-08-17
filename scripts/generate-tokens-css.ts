/**
 * Generates `src/styles/tokens.generated.css` from `src/styles/tokens.ts`.
 *
 * Tailwind v4 configures its theme in CSS, but CLAUDE.md requires a single
 * source of truth in TypeScript. Rather than maintain both by hand and let them
 * drift, this turns the token object into a Tailwind `@theme` block. It is
 * exported as a Vite plugin so it re-runs on dev start, on build, and whenever
 * `tokens.ts` is edited — there is no way to end up with stale CSS.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

import { tokens } from '../src/styles/tokens.ts'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const TOKENS_SRC = resolve(ROOT, 'src/styles/tokens.ts')
const OUT = resolve(ROOT, 'src/styles/tokens.generated.css')

/**
 * Maps each token group onto the Tailwind v4 theme namespace that generates the
 * matching utilities — `--color-*` produces `bg-*`/`text-*`, `--spacing-*`
 * produces `p-*`/`gap-*`, and so on.
 */
const NAMESPACES: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ['color', tokens.colors],
  ['shadow', tokens.glow],
  ['spacing', tokens.space],
  // Touch sizes ride the spacing namespace so `min-h-touch-min` and friends
  // resolve — Tailwind v4 has no separate size namespace.
  ['spacing', tokens.size],
  // Tailwind's container namespace is what backs `max-w-*`.
  ['container', tokens.measure],
  ['radius', tokens.radius],
  ['font', tokens.font],
  ['text', tokens.fontSize],
  ['font-weight', tokens.fontWeight],
  ['tracking', tokens.letterSpacing],
  ['leading', tokens.lineHeight],
  ['ease', tokens.easing],
]

function toCssVarName(namespace: string, key: string): string {
  // camelCase -> kebab-case, so `surfaceRaised` becomes `--color-surface-raised`
  const kebab = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  return `--${namespace}-${kebab}`
}

export function renderTokensCss(): string {
  const lines: string[] = [
    '/*',
    ' * GENERATED FILE — DO NOT EDIT.',
    ' * Produced from src/styles/tokens.ts by scripts/generate-tokens-css.ts.',
    ' * Edit the tokens there and this regenerates automatically.',
    ' */',
    '',
    '@theme {',
  ]

  for (const [namespace, group] of NAMESPACES) {
    lines.push(`  /* ${namespace} */`)
    for (const [key, value] of Object.entries(group)) {
      lines.push(`  ${toCssVarName(namespace, key)}: ${value};`)
    }
    lines.push('')
  }

  // Durations are plain custom properties: Tailwind has no duration namespace,
  // so these are consumed directly as var(--duration-base) in transitions.
  lines.push('  /* duration */')
  for (const [key, value] of Object.entries(tokens.duration)) {
    lines.push(`  ${toCssVarName('duration', key)}: ${value};`)
  }

  lines.push('}', '')
  return lines.join('\n')
}

/** Writes the file only when the contents change, to avoid dev-server churn. */
export function writeTokensCss(): void {
  const next = renderTokensCss()
  let current = ''
  try {
    current = readFileSync(OUT, 'utf8')
  } catch {
    // First run — the file does not exist yet.
  }
  if (current === next) return
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, next, 'utf8')
}

export function tokensCssPlugin(): Plugin {
  return {
    name: 'workout-tracker:generate-tokens-css',
    enforce: 'pre',
    buildStart() {
      writeTokensCss()
      this.addWatchFile(TOKENS_SRC)
    },
    configureServer(server) {
      server.watcher.add(TOKENS_SRC)
      server.watcher.on('change', (file) => {
        if (resolve(file) === TOKENS_SRC) writeTokensCss()
      })
    },
  }
}
