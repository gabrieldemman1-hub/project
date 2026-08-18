/**
 * PHASE 1 GATE — books, chapters, notes.
 *
 * Runs against fake-indexeddb with an injected fetch, so it proves the real
 * data layer rather than a mock of it, and needs no network (the sandbox has
 * none, and neither does a plane).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { db, ensureSettings } from '../src/db/db.ts'
import { allBooks, todaysBook } from '../src/db/queries.ts'
import { enrichBook, logChapter, seedLibrary, updateBook } from '../src/db/mutations.ts'
import { SEED_BOOKS } from '../src/db/seed.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? '  ok  ' : ' FAIL '
  if (!condition) failures++
  console.log(`[${mark}] ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`)
}

const okFetch = (body: unknown, coverBytes = 4096): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('covers.openlibrary.org')) {
      return new Response(new Uint8Array(coverBytes), { status: 200 })
    }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch

const deadFetch: typeof fetch = (async () => {
  throw new TypeError('Failed to fetch')
}) as typeof fetch

async function main() {
  await ensureSettings()

  section('1. The shelf seeds, and hardcodes nothing')
  const seeded = await seedLibrary()
  check('seeds all 21 books', seeded === 21, `${seeded} added`)

  const books = await allBooks()
  check('shelf holds 21', books.length === 21)
  check(
    'every seeded book starts with NO page count',
    books.every((b) => b.totalPages === null),
    'totalPages is null across the board',
  )
  check(
    'every seeded book starts at zero progress',
    books.every((b) => b.percentComplete === 0 && b.currentPage === null),
  )
  check('exactly one book is pinned as today', (await db.books.where('isToday').equals(1).count()) === 1)
  check("today's book resolves", (await todaysBook()) !== undefined)

  // The brief is explicit: page counts vary by edition, so none may be baked in.
  const seedSource = readFileSync(resolve(root, 'src/db/seed.ts'), 'utf8')
  const seedEntries = seedSource.slice(seedSource.indexOf('SEED_BOOKS'))
  const numericFields = /(totalPages|number_of_pages|pages)\s*:\s*\d+/.test(seedEntries)
  check('no page count is hardcoded in the seed file', !numericFields)

  const titles = new Set(books.map((b) => b.title))
  check(
    'every title from the brief is present',
    SEED_BOOKS.every((s) => titles.has(s.title)),
  )

  section('2. Open Library enrichment — success, failure, and a weak match')
  const grant = books.find((b) => b.title === 'Think Again')!
  const good = {
    docs: [
      {
        key: '/works/OL17091839W',
        title: 'Think Again: The Power of Knowing What You Don’t Know',
        author_name: ['Adam Grant'],
        cover_i: 10958382,
        number_of_pages_median: 307,
      },
    ],
  }
  check('a strong match enriches', (await enrichBook(grant.id, okFetch(good))) === 'enriched')
  const grantAfter = (await db.books.get(grant.id))!
  check('page count landed', grantAfter.totalPages === 307, `${grantAfter.totalPages}`)
  check('cover url landed', grantAfter.coverUrl?.includes('10958382') === true)
  check('cover cached as a blob for offline', grantAfter.coverBlob instanceof Blob)

  const housel = books.find((b) => b.title === 'The Psychology of Money')!
  check('a dead network does not throw', (await enrichBook(housel.id, deadFetch)) === 'failed')
  const houselAfter = (await db.books.get(housel.id))!
  check('book survives a failed lookup', houselAfter.totalPages === null && houselAfter.enrichFailed)
  const stillLoggable = await logChapter({
    bookId: housel.id,
    chapterLabel: 'Ch 1',
    position: 14,
    body: 'Nobody is crazy — everyone reasons from their own experience of money.',
  })
  check('a book with no page count is still fully loggable', stillLoggable.log.position === 14)

  const godin = books.find((b) => b.title === 'This Is Marketing')!
  const weak = {
    docs: [
      {
        key: '/works/WRONG',
        title: 'This Is Marketing',
        author_name: ['Someone Entirely Else'],
        cover_i: 4242,
        number_of_pages_median: 999,
      },
    ],
  }
  check('a weak author match is only partial', (await enrichBook(godin.id, okFetch(weak))) === 'partial')
  const godinAfter = (await db.books.get(godin.id))!
  check(
    'a weak match takes a cover but REFUSES the page count',
    godinAfter.coverUrl?.includes('4242') === true && godinAfter.totalPages === null,
  )

  section('3. Logging a chapter — both progress units')
  const martell = books.find((b) => b.title === 'Buy Back Your Time')!
  await updateBook(martell.id, { totalPages: 240 })
  const logged = await logChapter({
    bookId: martell.id,
    chapterLabel: 'Chapter 4 — The Buyback Principle',
    position: 60,
    body: 'Do not hire to grow the business. Hire to buy back your time, then point that time at what only you can do.',
  })
  check('percent computed from pages', logged.percentAfter === 25, `${logged.percentAfter}%`)
  check('progress moved from 0', logged.percentBefore === 0)
  const martellAfter = (await db.books.get(martell.id))!
  check('book row updated immediately', martellAfter.currentPage === 60 && martellAfter.percentComplete === 25)

  const note = await db.notes.where('bookId').equals(martell.id).first()
  check('a note was written with the log', note !== undefined)
  check('the note is linked to its log', note?.readingLogId === logged.log.id)
  check('the log is linked back to its note', logged.log.noteId === note?.id)

  const hormozi = books.find((b) => b.title === '$100M Offers')!
  await updateBook(hormozi.id, { progressUnit: 'percent' })
  const audio = await logChapter({
    bookId: hormozi.id,
    chapterLabel: 'Section 3',
    position: 41,
    body: 'A grand slam offer is priced so the value is obvious before the price is mentioned.',
  })
  check('percent book takes the percentage directly', audio.percentAfter === 41)
  const hormoziAfter = (await db.books.get(hormozi.id))!
  check(
    'a percent book carries NO page number — absent, not zero',
    hormoziAfter.currentPage === null,
  )

  section('4. The transaction holds')
  const before = { logs: await db.readingLogs.count(), notes: await db.notes.count() }
  let threw = false
  try {
    await logChapter({ bookId: martell.id, chapterLabel: 'Ch 5', position: 70, body: '   ' })
  } catch {
    threw = true
  }
  check('an empty note is refused', threw)
  check(
    'nothing was half-written',
    (await db.readingLogs.count()) === before.logs && (await db.notes.count()) === before.notes,
  )

  section('5. The manifest installs to a home screen')
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'))
  check('display is standalone', manifest.display === 'standalone')
  check('scope and start_url are relative, so a subdirectory deploy works',
    manifest.start_url === './' && manifest.scope === './')
  check('has a 192 and a 512 icon', manifest.icons.length >= 3)
  check('has a maskable icon', manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable'))
  const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  check('links an apple-touch-icon', html.includes('apple-touch-icon'))
  check('declares apple-mobile-web-app-capable', html.includes('apple-mobile-web-app-capable'))
  check('viewport opts into the safe area', html.includes('viewport-fit=cover'))
  check(
    'pinch-zoom is NOT disabled — this is a reading app',
    !html.includes('maximum-scale'),
  )
  check(
    'status bar style is default, not black-translucent over a cream theme',
    html.includes('apple-mobile-web-app-status-bar-style" content="default'),
  )

  section('6. It opens with no network')
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
  check('a service worker exists', sw.length > 0)
  check('navigations fall back to the cached shell', sw.includes("request.mode === 'navigate'"))
  check('the api routes are never cached', sw.includes("url.pathname.includes('/api/')"))
  check('cross-origin requests are left alone', sw.includes('url.origin !== self.location.origin'))
  const storage = readFileSync(resolve(root, 'src/lib/storage.ts'), 'utf8')
  check('the worker registers scoped, so a subdirectory deploy works', storage.includes('scope: base.pathname'))
  check('durable storage is requested', storage.includes('navigator.storage.persist'))

  console.log(
    `\n${failures === 0 ? 'PHASE 1 GATE PASSED' : `PHASE 1 GATE FAILED — ${failures} check(s)`}\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
