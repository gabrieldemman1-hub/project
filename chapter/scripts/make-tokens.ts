/** Writes src/styles/tokens.css from src/styles/tokens.ts. Run by `npm run build`. */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { toCss } from '../src/styles/tokens.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../src/styles/tokens.css')
writeFileSync(out, toCss(), 'utf8')
console.log(`tokens.css written (${toCss().split('\n').length} lines)`)
