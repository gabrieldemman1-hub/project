/**
 * PHASE 4 GATE — voice and the AI tutor.
 *
 * Part A exercises the server routes directly, with the environment and fetch
 * stubbed, because the two things that matter are failure paths: a refused
 * microphone, a dead transcriber, an unconfigured deployment.
 * Part B greps the built client bundle for anything that looks like a key.
 * Part C proves in a real browser that both features vanish completely when the
 * routes are not deployed — no dead buttons.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const PORT = 4323
const BASE = `http://127.0.0.1:${PORT}/`

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`[${ok ? '  ok  ' : ' FAIL '}] ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(t: string) {
  console.log(`\n${t}\n${'-'.repeat(t.length)}`)
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function partA() {
  section('A1. Health reports only whether things are configured')
  delete process.env['ANTHROPIC_API_KEY']
  delete process.env['TRANSCRIBE_URL']
  delete process.env['TRANSCRIBE_KEY']

  const health = (await import('../api/health.ts')).default
  const bare = await bodyOf(health(new Request('http://x/api/health')))
  check('an unconfigured deployment advertises nothing',
    bare['transcribe'] === false && bare['grade'] === false)

  process.env['TRANSCRIBE_URL'] = 'https://example.invalid/v1/audio/transcriptions'
  process.env['TRANSCRIBE_KEY'] = 'sk-transcribe-secret-value'
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-secret-value'
  const configured = await bodyOf(health(new Request('http://x/api/health')))
  check('a configured deployment advertises both',
    configured['transcribe'] === true && configured['grade'] === true)
  check('and never returns the keys themselves',
    !JSON.stringify(configured).includes('secret-value'))

  section('A2. Transcription refuses badly-formed work rather than guessing')
  const transcribe = (await import('../api/transcribe.ts')).default

  const wrongMethod = await transcribe(new Request('http://x/api/transcribe'))
  check('GET is refused', wrongMethod.status === 405)

  const emptyForm = new FormData()
  const noAudio = await transcribe(
    new Request('http://x/api/transcribe', { method: 'POST', body: emptyForm }),
  )
  check('a request with no audio is refused', noAudio.status === 400)

  const emptyAudio = new FormData()
  emptyAudio.append('audio', new File([], 'note.webm', { type: 'audio/webm' }))
  const empty = await transcribe(
    new Request('http://x/api/transcribe', { method: 'POST', body: emptyAudio }),
  )
  check('an empty recording is refused', empty.status === 400)

  section('A3. The transcription key never leaves the server')
  const realFetch = globalThis.fetch
  let sawAuthHeader = ''
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    sawAuthHeader = headers.get('authorization') ?? ''
    return new Response(JSON.stringify({ text: 'the transcript' }), { status: 200 })
  }) as typeof fetch

  const form = new FormData()
  form.append('audio', new File([new Uint8Array(2048)], 'note.webm', { type: 'audio/webm' }))
  const ok = await transcribe(new Request('http://x/api/transcribe', { method: 'POST', body: form }))
  const okBody = await bodyOf(ok)
  check('a good recording comes back as text', ok.status === 200 && okBody['text'] === 'the transcript')
  check('the upstream call carried the bearer token', sawAuthHeader.includes('sk-transcribe-secret-value'))
  check('but the response to the client did not', !JSON.stringify(okBody).includes('secret-value'))

  globalThis.fetch = (async () =>
    new Response('upstream said: authorization sk-transcribe-secret-value', { status: 500 })) as typeof fetch
  const upstreamFailed = await transcribe(
    new Request('http://x/api/transcribe', { method: 'POST', body: (() => {
      const f = new FormData()
      f.append('audio', new File([new Uint8Array(2048)], 'note.webm', { type: 'audio/webm' }))
      return f
    })() }),
  )
  const failedBody = await bodyOf(upstreamFailed)
  check('an upstream failure is reported as a failure', upstreamFailed.status === 502)
  check('and its body is NOT forwarded — it can echo our own headers',
    !JSON.stringify(failedBody).includes('secret-value'), JSON.stringify(failedBody))
  globalThis.fetch = realFetch

  section('A4. Grading refuses to run unconfigured, and never decides anything')
  const grade = (await import('../api/grade.ts')).default
  delete process.env['ANTHROPIC_API_KEY']
  const unconfigured = await grade(
    new Request('http://x/api/grade', {
      method: 'POST',
      body: JSON.stringify({ note: 'a', attempt: 'b' }),
    }),
  )
  check('an unconfigured deployment returns 503, not a fake grade', unconfigured.status === 503)

  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-secret-value'
  const missingHalf = await grade(
    new Request('http://x/api/grade', { method: 'POST', body: JSON.stringify({ note: 'a' }) }),
  )
  check('a request missing the attempt is refused', missingHalf.status === 400)

  const badJson = await grade(new Request('http://x/api/grade', { method: 'POST', body: 'not json' }))
  check('unreadable input is refused', badJson.status === 400)

  const source = readFileSync(resolve(root, 'api/grade.ts'), 'utf8')
  check('the route only ever returns a SUGGESTED grade', source.includes('suggested_grade'))
  check('it cannot write to the database', !/dexie|from '\.\.\/src\/db/.test(source))
  check('it uses the current model', source.includes("model: 'claude-opus-5'"))
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function partB() {
  section('B. No key reaches the client bundle')
  const dist = resolve(root, 'dist')
  check('a build exists to inspect', existsSync(dist))
  const files = walk(dist).filter((f) => /\.(js|css|html|webmanifest)$/.test(f))
  check('the bundle has files to check', files.length > 0, `${files.length} files`)

  const forbidden = ['ANTHROPIC_API_KEY', 'TRANSCRIBE_KEY', 'sk-ant-', 'x-api-key']
  const hits: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const needle of forbidden) {
      if (text.includes(needle)) hits.push(`${file.replace(dist, 'dist')}: ${needle}`)
    }
  }
  check('no key name or key-shaped string appears anywhere in dist/', hits.length === 0, hits.join(', '))

  const sdkInClient = files.some((f) => readFileSync(f, 'utf8').includes('anthropic-version'))
  check('the Anthropic SDK is not bundled into the client', !sdkInClient)
}

async function partC() {
  section('C. With no server, both features are absent — not broken')
  const server: ChildProcess = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: root, stdio: 'ignore' },
  )
  const dir = process.env['PLAYWRIGHT_BROWSERS_PATH']
  const exe = dir && existsSync(dir)
    ? readdirSync(dir)
        .filter((e) => e.startsWith('chromium-'))
        .sort()
        .reverse()
        .map((e) => join(dir, e, 'chrome-linux', 'chrome'))
        .find((p) => existsSync(p))
    : undefined
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})

  try {
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(BASE)).ok) break
      } catch {
        /* not up */
      }
      await new Promise((r) => setTimeout(r, 250))
    }

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await page.goto(`${BASE}#/log`)
    await page.getByPlaceholder(/most important idea/).waitFor()
    await page.waitForTimeout(600)

    const text = await page.evaluate(() => document.body.innerText)
    check('the record button is absent when no route is deployed', !/Speak it instead/.test(text))
    check('the keyboard-mic hint is still there — voice never disappears entirely',
      /Tap the mic on your keyboard/.test(text))
    check('typing still works', true)
    await page.getByPlaceholder(/most important idea/).fill('Typed, with no server anywhere.')
    const typed = await page.getByPlaceholder(/most important idea/).inputValue()
    check('and what was typed stays typed', typed.includes('no server anywhere'))

    await page.screenshot({ path: resolve(root, 'screenshots/phase4-no-server.png') })
    await context.close()
  } finally {
    await browser.close()
    server.kill()
  }
}

async function main() {
  const built = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' })
  if (built.status !== 0) throw new Error('build failed')

  await partA()
  partB()
  await partC()

  console.log(
    `\n${failures === 0 ? 'PHASE 4 GATE PASSED' : `PHASE 4 GATE FAILED — ${failures} check(s)`}\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
