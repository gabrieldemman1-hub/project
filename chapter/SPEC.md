# Chapter — Build Spec

Read a chapter each morning, write what mattered in your own words, and let the app hand it back to
you at night when you've almost forgotten it.

Single user. Mobile-first PWA, installed to an iPhone home screen. No accounts, no sharing, no
multi-user anything, ever.

This document is self-contained. It names every file and interface, states what is out of scope for
each phase, and ends each phase with an end-to-end verification step that proves the feature works.

---

## 1. The two rituals

**Morning — read.** Open the app. See today's book. Read one chapter, or listen to it. Log it: chapter
label, current page (or percent, for audiobooks), and a note in your own words about the most
important idea. Progress bar moves, percentage ticks up. That is the first celebration of the day.

**Night — recall.** From 7pm the app is dark, and the dark screen is itself the signal. It serves
notes that are due, body **hidden**. You recall out loud, then reveal, then grade yourself: got it /
partial / missed. Closing the session is the second celebration.

The distinction between recall and rereading is the entire point of the app. The note body is never
visible before the reveal, and §6.5 makes that structurally impossible rather than merely intended.

---

## 2. Stack, and why

**Vite + React 19 + TypeScript (strict) + Tailwind v4 + Dexie (IndexedDB) + Vitest + Playwright.**
Static PWA. Phase 4 adds two serverless functions under `/api/`.

Defending it against your four stated constraints:

- **No monthly subscription.** The app is a static bundle — free on GitHub Pages today, free on
  Vercel's hobby tier when you want the Phase 4 routes. Your data lives in IndexedDB on the phone, so
  there is no database bill and no free tier that pauses your project after a week of inactivity.
- **Must be a web app that installs to an iPhone home screen.** A manifest with `display: standalone`
  plus an `apple-touch-icon` gives you a home-screen icon that opens with no browser chrome.
- **Single user.** Local-first is not a compromise here, it is strictly better: no auth, no login
  screen, no round trip. The app opens instantly and works on the subway. There is no server to
  attack because there is no server.
- **Bolt an LLM API on in Phase 4.** Two serverless functions, `/api/transcribe` and `/api/grade`,
  hold the keys server-side. The client feature-detects them, so Phases 1–3 stay a pure static site
  and nothing about Phase 4 requires rewriting what came before.

And one more: you already run this exact stack on your phone — the workout tracker is Vite + React +
TS + Tailwind + Dexie. Familiar tools on a habit app you are trying to actually keep is worth more
than a marginally better framework.

**Rejected, with reasons.** *Next.js* — its value is server rendering and routing, and a six-screen
single-user local-first app uses neither; it would be more framework than app. *Supabase or any
hosted Postgres* — a bill risk, an auth flow for one person, a network dependency on the two moments
of the day the app must never fail, and it breaks offline. *React Native / Expo* — you said web app,
and the App Store is a subscription in disguise (the developer programme is $99/year).

**Dependency policy.** The list in `package.json` is the complete expected set. Nothing gets added
without a one-sentence reason why the built-in option won't do.

---

## 3. Architecture

Three rules, and the build is judged against them:

1. **`lib/scheduler.ts` and `lib/streaks.ts` are pure.** No database calls, no `Date.now()`, no `new
   Date()` with no argument. The current day is always a parameter. These are the only modules with
   deep unit tests, and they are the reason the app can be trusted.
2. **All persistence goes through `src/db/`.** Components never import Dexie directly.
3. **One accent colour, defined once.** Amber, as a CSS custom property in `src/styles/tokens.css`,
   generated from `src/styles/tokens.ts`. No component ever hardcodes a colour.

### File map

```
chapter/
  index.html
  vite.config.ts            tsconfig.json  tsconfig.app.json  tsconfig.node.json
  SPEC.md                   CLAUDE.md
  public/
    manifest.webmanifest    icon-192.png  icon-512.png  apple-touch-icon.png  icon-maskable-512.png
  api/                                            # Phase 4 only — Vercel-style serverless
    health.ts               transcribe.ts  grade.ts
  scripts/
    shoot.ts                                      # Playwright screenshots at iPhone width
    prove-phase1.ts  prove-phase2.ts  prove-phase3.ts  prove-phase4.ts
    make-icons.ts
  src/
    main.tsx  App.tsx
    lib/
      scheduler.ts    scheduler.test.ts           # PURE. Phase 3.
      streaks.ts      streaks.test.ts             # PURE. Phase 2.
      theme.ts        theme.test.ts               # PURE. Phase 2.
      day.ts          day.test.ts                 # PURE. day keys, local midnight.
      openLibrary.ts  openLibrary.test.ts         # network, fully stubbable
      ids.ts          router.ts  format.ts  useLive.ts
      speech.ts       speech.test.ts              # Phase 4A. MediaRecorder wrapper.
      aiGrade.ts      aiGrade.test.ts             # Phase 4B. client half.
    db/
      db.ts  schema.ts  queries.ts  mutations.ts  seed.ts  backup.ts
    components/
      Button.tsx  Card.tsx  Screen.tsx  Stepper.tsx  ProgressBar.tsx
      Field.tsx   Sheet.tsx  Celebration.tsx  StreakNumber.tsx  Cover.tsx  EmptyState.tsx
    features/
      dashboard/  DashboardScreen.tsx
      library/    LibraryScreen.tsx  BookCard.tsx  BookDetailScreen.tsx  BookForm.tsx
      log/        LogChapterScreen.tsx  NoteEditor.tsx  PositionInput.tsx
      night/      NightSessionScreen.tsx  RecallCard.tsx  GradeBar.tsx  SessionSummary.tsx
      settings/   SettingsScreen.tsx
    styles/
      tokens.ts  tokens.css  index.css
    test/
      setup.ts  factories.ts
```

### Commands

| Command | Does |
|---|---|
| `npm run dev` | local dev server |
| `npm run build` | `tsc -b && vite build` — MUST pass before any phase is called done |
| `npm test` | Vitest — scheduler, streaks, theme, day, Open Library, backup |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run shoot` | Playwright screenshots of every screen at 390×844, light and dark |
| `npm run prove-phase<N>` | that phase's end-to-end verification |

---

## 4. Resolved ambiguities

The brief contradicts itself in two places and is silent in a few more. These are the readings the
build uses, each with the reason. Change them here first if you disagree, not in the code.

### 4.1 The intervals are cumulative, not absolute — the brief's own test proves it

The brief says intervals are *"+1, +3, +7, +14, +30 days **from note creation**"* and then asserts
*"a note created today, graded correctly five times, is due 55 days out."*

Those cannot both be true. Read literally, "from note creation" would put the last review at day 30.
But **1 + 3 + 7 + 14 + 30 = 55**, so the 55-day assertion forces the cumulative reading: each
interval is measured from the **previous review**, not from creation.

Due dates for a note created on day 0 and always graded `got it`:

| Review | Interval | Due day |
|---|---|---|
| 1st | +1 | 1 |
| 2nd | +3 | 4 |
| 3rd | +7 | 11 |
| 4th | +14 | 25 |
| 5th | +30 | **55** |

The unit test asserts exactly this sequence, so the ambiguity can never quietly return.

### 4.2 The next due date is measured from when you *actually* reviewed, not when it was due

If a note was due Monday and you grade it on Friday, the next interval starts Friday. The alternative
— scheduling from the missed due date — makes an overdue note stay overdue after you've done the
work, so a week away would leave you permanently behind and every subsequent interval compressed. The
schedule follows you; it does not punish you for arriving late.

### 4.3 The ladder clamps at +30

`got it` on a note already at the +30 rung keeps it at +30. The brief lists five intervals and stops,
so the fifth is the ceiling. A note you know well returns monthly forever, which is the correct
behaviour for a book you want to keep.

### 4.4 One pending review per note, always

This is the invariant that makes "a note missed twice doesn't spiral" true. Grading closes the open
review row (writes `result` and `reviewedAt`) and inserts exactly one new pending row. A note can
never accumulate two pending reviews, so it can never appear twice in one night session, and missing
it repeatedly just keeps rescheduling one row to tomorrow. Enforced by a test that grades a note
`missed` five times and asserts `pending.length === 1` throughout.

### 4.5 Streaks run on local midnight, per the brief

The brief names *"timezone boundary at local midnight"* as a test case, so a day runs midnight to
midnight in local time. The honest cost: reading at 12:30am counts for the new day, which can look
like you skipped the day you actually read. If that bites, `DAY_ROLLOVER_HOUR` in `src/lib/day.ts` is
a single constant — changing it to 4 fixes it, and the tests are written against the constant rather
than against hardcoded midnights.

Day keys are stamped `'YYYY-MM-DD'` from local time **at the moment of writing** and never
recomputed. Travelling or a DST change cannot retroactively re-bucket your history.

### 4.6 "Overrides until the next day" means until the next local midnight

A manual theme toggle persists across reloads and app restarts, and expires at the next local
midnight, after which the 19:00 clock rule resumes. Stored as the day key the override was set on, so
expiry needs no timer — it is a string comparison at render time.

### 4.7 Page counts are never hardcoded

The 21 books are seeded with title, author and `progressUnit` only. `totalPages` starts `null` and is
filled either by an Open Library lookup in the browser or by you. A book with `totalPages: null` is
fully usable — it shows "p. 128" instead of a percentage, and the shelf shows a progress bar only
once a total exists. This satisfies the brief's "don't hardcode page counts" without making the app
depend on a network call to function.

---

## 5. Data model

Dexie database `chapter`, schema version 1, declared in `src/db/schema.ts`. Every row has a string
`id` from `src/lib/ids.ts` and an `updatedAt` epoch-ms. Every `dayKey` is `'YYYY-MM-DD'` local.

### `books`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `title`, `author` | `string` | |
| `progressUnit` | `'pages' \| 'percent'` | Audiobooks use `percent`. Set at seed time, editable. |
| `totalPages` | `number \| null` | Null until Open Library or you fill it. Never hardcoded. |
| `currentPage` | `number \| null` | Latest logged page, `pages` unit only |
| `percentComplete` | `number` | 0–100. Derived for `pages`, entered directly for `percent`. |
| `coverUrl` | `string \| null` | Open Library URL |
| `coverBlob` | `Blob \| null` | Cached so the shelf works offline |
| `olKey` | `string \| null` | Open Library work key, e.g. `/works/OL123W` |
| `enrichAttemptedAt` | `number \| null` | So a failed lookup is retried, not repeated forever |
| `enrichFailed` | `boolean` | Drives the "set this yourself" affordance |
| `status` | `'reading' \| 'finished' \| 'paused'` | |
| `isToday` | `boolean` | Exactly one book may be the current focus |
| `sortIndex` | `number` | Shelf order, user-editable |
| `addedAt`, `updatedAt` | `number` | |

### `readingLogs`

`id`, `bookId`, `chapterLabel`, `position` (page number or percent), `progressUnit`,
`percentAfter | null`, `loggedAt`, `dayKey`, `noteId | null`, `updatedAt`.

One row per logged chapter. This table alone drives the reading streak.

### `notes`

`id`, `bookId`, `readingLogId`, `chapterLabel`, `body`, `source: 'typed' | 'voice'`, `createdAt`,
`dayKey`, `updatedAt`.

The body is the user's own words. Rendered in the serif face, everywhere it appears.

### `reviews`

`id`, `noteId`, `dueDate: DayKey`, `intervalIndex: 0..4`, `result: 'got_it' | 'partial' | 'missed' |
null`, `reviewedAt: number | null`, `createdAt`, `updatedAt`.

`result === null` means **pending**. Exactly one pending row per live note (§4.4). Graded rows are
kept forever as history and are what the review streak and the stats are computed from.

### `sessions`

`id`, `kind: 'review'`, `dayKey`, `startedAt`, `endedAt | null`, `served`, `graded`.

A closed review session is what increments the review streak — not individual grades, so grading two
notes and closing counts the same as grading five.

### `settings`

Singleton, id `'settings'`: `themeMode: 'auto' | 'light' | 'dark'`, `themeOverrideDay: DayKey | null`,
`darkFromHour: 19`, `reviewCap: 5`, `lastBackupAt: number | null`, `seedVersion: number`.

### `meta`

Singleton: `schemaVersion`.

### Shape notes

- **`percentComplete` is denormalised** onto `books` so the shelf is one read. `src/db/mutations.ts`
  owns keeping it correct, and a test asserts it matches the latest log after arbitrary edits.
- **Nothing is hard-deleted** except by explicit user action in Settings, and deleting a book states
  the cascade counts first.
- Every row carries `id` and `updatedAt`, and no table uses auto-increment keys, so a sync layer
  remains possible later. Nothing in this project builds toward one.

---

## 6. The pure core

No React, no Dexie, no clock. `today: DayKey` is always a parameter. These are the only modules with
exhaustive tests, and they are what the app's trustworthiness rests on.

### 6.1 `src/lib/day.ts`

```ts
export const DAY_ROLLOVER_HOUR = 0            // local midnight, per §4.5
export type DayKey = string                   // 'YYYY-MM-DD'

export function dayKeyOf(at: Date | number): DayKey
export function addDays(day: DayKey, n: number): DayKey
export function diffDays(from: DayKey, to: DayKey): number
export function isBefore(a: DayKey, b: DayKey): boolean
export function todayKey(now: Date): DayKey    // `now` is injected — never read internally
```

`addDays` and `diffDays` operate on the calendar, not on 86,400,000ms arithmetic, so a DST transition
cannot produce an off-by-one.

### 6.2 `src/lib/scheduler.ts`

```ts
export const INTERVALS = [1, 3, 7, 14, 30] as const
export type Grade = 'got_it' | 'partial' | 'missed'

export interface PendingReview {
  id: string
  noteId: string
  dueDate: DayKey
  intervalIndex: number
}

export interface NextReview {
  intervalIndex: number
  dueDate: DayKey
  intervalDays: number
  sentence: string          // 'Got it — back in 7 days.'
}

export function firstReview(createdDay: DayKey): NextReview
export function nextReview(current: { intervalIndex: number }, grade: Grade, reviewedOn: DayKey): NextReview
export function buildSession(pending: PendingReview[], today: DayKey, cap: number): SessionQueue
export function describeInterval(days: number): string
```

**Grading**

| Grade | Interval index | Next due | Sentence |
|---|---|---|---|
| `got_it` | `min(i + 1, 4)` | `reviewedOn + INTERVALS[next]` | "Got it — back in 7 days." |
| `partial` | `i` (unchanged) | `reviewedOn + INTERVALS[i]` | "Partial — same gap again, 3 days." |
| `missed` | `0` | `reviewedOn + 1` | "Missed — back tomorrow." |

**`buildSession`** returns:

```ts
export interface SessionQueue {
  queue: PendingReview[]      // length <= cap
  dueCount: number            // everything due today or earlier
  overdueCount: number        // due strictly before today
  heldBack: number            // dueCount - queue.length
  nothingDue: boolean
}
```

Ordering is **oldest `dueDate` first**, tie-broken by `intervalIndex` ascending (weakest notes first),
then by `id` — fully deterministic, so the test can assert an exact sequence. Overdue notes therefore
take priority automatically. Nothing due in the future is ever pulled forward by `buildSession`;
reviewing early is a separate, explicit call (§7.5).

**The cap is not negotiable.** `cap` defaults to 5. Coming back to 40 due notes and being shown 5 is
the thing that stops you deleting the app. The screen states what it held back — *"5 of 23 tonight.
The rest keep."* — so the cap is visible leniency, not a lie.

### 6.3 `src/lib/streaks.ts`

```ts
export interface DayStamped { dayKey: DayKey }

export interface Streak {
  current: number
  longest: number
  lastDay: DayKey | null
  doneToday: boolean
}

export function readingStreak(logs: DayStamped[], today: DayKey): Streak
export function reviewStreak(sessions: DayStamped[], today: DayKey): Streak
```

Two functions, two separate inputs. `readingStreak` is only ever handed `readingLogs` and
`reviewStreak` is only ever handed closed `sessions`. Review activity cannot break the reading streak
because the reading streak function is never shown a review — the guarantee is structural, not a rule
someone has to remember.

Rules, identical for both:

- Days are de-duplicated first, so logging three chapters on Tuesday is one day.
- **A streak ending yesterday is still alive.** At 8am, before you have read, the streak reads
  yesterday's number, not zero. Requiring activity today would show a broken streak every single
  morning — the exact moment the app is meant to motivate you.
- A streak ending the day before yesterday or earlier is dead: `current === 0`.
- `doneToday` is a separate boolean, so the dashboard can say "5 days · today not done yet" without
  the streak number flickering.
- `longest` is computed across the whole history, gaps included.
- Entries dated in the future are ignored rather than trusted.

### 6.4 `src/lib/theme.ts`

```ts
export type Theme = 'light' | 'dark'
export type ThemeMode = 'auto' | 'light' | 'dark'

export function resolveTheme(
  now: Date,
  settings: { themeMode: ThemeMode; themeOverrideDay: DayKey | null; darkFromHour: number },
  today: DayKey,
): { theme: Theme; overrideActive: boolean }
```

`auto` → dark when `now.getHours() >= darkFromHour` (19), light otherwise. A manual mode applies only
while `themeOverrideDay === today`; on any later day the override is spent and `auto` resumes (§4.6).
Pure, and tested at 18:59, 19:00, 23:59, 00:00 and across a day boundary with a live override.

### 6.5 The reveal invariant

The note body must never reach the client's rendered DOM before the user taps reveal. This is
enforced three ways, because it is the point of the app:

1. `RecallCard.tsx` does not render the body element at all while hidden — not hidden with CSS,
   **not present**. CSS hiding is defeated by a screenshot, a text search, or an accidental select-all.
2. The reveal is a state transition in the component, and the grade bar is not mounted until it has
   happened, so a grade cannot be recorded for a note that was never revealed.
3. `prove-phase3.ts` asserts, against the real rendered page, that the note body string does **not**
   appear anywhere in the DOM before the reveal tap and does appear after it.

### 6.6 `src/lib/openLibrary.ts`

```ts
export interface OLMatch { olKey: string; title: string; author: string; coverUrl: string | null; totalPages: number | null; confidence: 'high' | 'low' }
export function buildSearchUrl(title: string, author: string): string
export function pickMatch(payload: unknown, title: string, author: string): OLMatch | null
export async function lookup(title: string, author: string, fetchImpl?: typeof fetch): Promise<OLMatch | null>
```

`pickMatch` is pure and separately tested against recorded payloads, so the matching logic is covered
without a network. `lookup` takes an injectable `fetch`, times out at 6 seconds via `AbortController`,
and returns `null` on **every** failure path — offline, 404, 429, malformed JSON, no match, low
confidence. It never throws into the UI.

Confidence is `low` when the returned author does not share a surname with the requested one; a `low`
match contributes a cover but **never** a page count, because a wrong page count silently corrupts
every percentage you will ever see for that book.

---

## 7. Screens

Hash router in `src/lib/router.ts`. No router dependency.

### 7.1 Dashboard — the front door (`features/dashboard/DashboardScreen.tsx`)

- **The reading streak, large, in amber.** The loud one. With a single line beneath: *"5 days · read
  today to keep it"* or *"5 days · done today"*.
- **Today's book** — cover, title, progress bar, percent.
- **One obvious primary action**: *Read today's chapter*. When today is already logged it becomes a
  quiet confirmed state, not a second identical button.
- **The review streak, quiet and small**, on its own line. When notes are due after 19:00 the night
  action appears as a secondary control: *Recall 5 notes*.
- Nothing else. This screen answers "what do I do now" in one glance and nothing competes with it.

### 7.2 Library (`features/library/LibraryScreen.tsx`, `BookCard.tsx`)

Shelf of covers: cover image, title, author, progress bar, percent complete, and pages read where a
page count exists. Books with no cover render a typographic fallback in `Cover.tsx` rather than a
broken image. Tapping a book opens the detail screen.

### 7.3 Book detail and form (`BookDetailScreen.tsx`, `BookForm.tsx`)

**Every field is editable**: title, author, progress unit, total pages, current page, cover URL,
status, and whether it is today's book. A *Look up again* control re-runs the Open Library enrichment
by hand. Beneath: this book's logged chapters and notes, newest first.

### 7.4 Log a chapter (`features/log/LogChapterScreen.tsx`)

Pick book → chapter label → position → note → save.

- `PositionInput.tsx` is format-aware: a page stepper for `pages`, a percent stepper for `percent`.
  Steppers first, tap-to-type second — this is used one-handed, half-awake, with coffee.
- `NoteEditor.tsx` is a plain `<textarea>` rendered in the serif face at reading size. Plain is
  deliberate: it means the iOS keyboard's own dictation mic works with zero code, which per the
  brief's risk section is the right answer for Phase 1.
- Saving writes the log, the note, and the note's first review row in one Dexie transaction, updates
  the book's progress, and plays the first celebration of the day.

### 7.5 Night session (`features/night/NightSessionScreen.tsx`)

- Serves `buildSession(...)` — up to 5, overdue first. States what it held back.
- `RecallCard.tsx` shows **book, chapter label, and the date the note was written. Nothing else.**
  A prompt: *"Say what this chapter's idea was, out loud."*
- Tap to reveal. The body appears in serif, and only then does `GradeBar.tsx` mount: **Got it ·
  Partial · Missed**.
- After grading, the engine's sentence shows briefly — *"Back in 7 days."*
- `SessionSummary.tsx` closes the session, increments the review streak, and plays the second
  celebration.
- **Nothing due** is a first-class state, not an empty list: *"Nothing due tonight."* with an explicit
  *Review something early* control that pulls the soonest-due notes regardless of date.

### 7.6 Settings (`features/settings/SettingsScreen.tsx`)

Theme (auto / light / dark, with the override explained), dark-from hour, review cap, JSON export and
import, re-run Open Library enrichment for all books, and book deletion with counted cascade.

---

## 8. Design

Modern, clean, minimal. Lots of empty space. Mobile-first — designed at 390×844 and checked there.

- **One accent: deep amber / warm orange.** `--accent: #E08A2B` in light, `#F5A63D` in dark — the same
  hue, lifted in dark so it glows on near-black without vibrating. It is the only accent. Nothing else
  is coloured except state text: a muted red for a broken streak or a `missed` grade, a muted green
  for `got it`.
- **Light by day, near-black by night.** Light: `#FBFAF8` ground, `#FFFFFF` cards, `#191714` ink.
  Dark: `#0C0B0A` ground, `#161412` cards, `#EDE9E3` ink. Warm-tinted on both sides, so the app reads
  as paper rather than as a terminal.
- **Type.** Literata (variable) for note bodies only — it is a typeface designed for long-form
  reading, and notes should read like a book. Inter (variable) for every piece of UI chrome. The
  streak number is Inter at a large optical size with tabular figures so it doesn't jump as it ticks.
- **Layout.** Generous negative space. Primary actions in the bottom third, where a thumb is. Safe-area
  insets respected. Minimum 44px touch targets.
- **Motion.** Restrained. The progress bar fills over ~600ms, the percentage counts up, the streak
  number scales once. No confetti. `prefers-reduced-motion` collapses every animation to an instant
  state change.
- **Celebration, twice a day.** Morning: the bar fills and the percentage ticks up. Night: the session
  summary lands with the review streak incrementing. Both are ~1 second and dismissible by tapping.

Tokens live in `src/styles/tokens.ts` as semantic light/dark pairs and are emitted to
`src/styles/tokens.css` as custom properties. Components reference `var(--accent)`, never a hex value,
and never a theme name.

---

## 9. Edge cases and honest limitations

| Situation | Behaviour |
|---|---|
| Miss a day's reading | Reading streak breaks to 0. Nothing else changes; notes stay due, the app does not scold. |
| Skip the night session | Review streak breaks. **The reading streak is untouched** — structurally, per §6.3. |
| Skip a week, 40 notes due | You are shown 5, oldest first, and told *"5 of 40 tonight. The rest keep."* Grading them reschedules from tonight, so tomorrow you get the next 5 rather than 35. |
| Review a note late | Next interval runs from the day you actually reviewed (§4.2). |
| Miss the same note repeatedly | Resets to +1 each time, one pending row only, no accumulation, no spiral (§4.4). |
| Audiobook | `progressUnit: 'percent'`. No page fields are shown at all for that book — not disabled, absent. |
| Open Library returns a wrong page count | Every field is editable, and a low-confidence match contributes a cover but never a page count (§6.6). |
| Open Library is down or you're offline | The book is still seeded and fully usable with `totalPages: null`; it shows "p. 128" instead of a percentage, and offers *Look up again*. |
| Reading at 12:30am | Counts for the new day, per local midnight (§4.5). One constant changes this if it bites. |
| Travel / DST | Day keys are stamped at write time and never recomputed. |
| Log two chapters in one day | Both are recorded; the streak counts the day once. |
| Note body leaking before reveal | Impossible — the element is not rendered, and `prove-phase3` asserts the string is absent from the DOM (§6.5). |
| App killed mid-log | The log, note and first review are written in one transaction, so it is all-or-nothing. Nothing half-saved. |
| App killed mid-night-session | Each grade is committed the moment it is tapped. Reopening rebuilds the queue minus what was graded. |
| iOS voice input | Phases 1–3 use the iOS keyboard's own dictation mic in a plain textarea: zero code, works offline, cannot be broken by a Safari update. `SpeechRecognition` is never used — on iOS it needs network, cuts off at pauses, and has a history of breaking in installed PWAs. Real transcription is Phase 4A. |
| Safari data eviction | IndexedDB is evicted after 7 days of disuse for sites **not** installed to the home screen. Installing is the actual protection, and Settings says so in plain words next to the export button. |
| No reminders | The app cannot schedule a local notification on iOS. It is somewhere you go at 7pm, not something that finds you. Stated rather than faked. |

---

## 10. Build phases

One phase per session. A phase is done when `npm run build` passes, `npm test` passes, its
verification script has been run and its **output shown** — not when the code looks right.

---

### Phase 1 — books, chapters, notes

**Build.**
1. Vite + React + TS strict + Tailwind scaffold. `src/styles/tokens.ts` → `tokens.css` with the full
   amber light/dark pairs from §8 defined now, even though the auto-switch is Phase 2.
2. PWA manifest (`public/manifest.webmanifest`), icons, `apple-touch-icon`, `display: standalone`,
   safe-area insets — it installs to an iPhone home screen and opens with no browser chrome.
3. Dexie schema and migration for `books`, `readingLogs`, `notes` (plus `settings`, `meta`).
4. `src/db/seed.ts` — the 21 books from Appendix A, seeded with title, author and `progressUnit`
   only. `src/lib/openLibrary.ts` enriches covers and page counts **in the browser**, one book at a
   time with pacing, degrading silently.
5. Library screen: shelf with cover, title, author, progress bar, percent. Book detail with every
   field editable, including a manual page-count override.
6. Log-a-chapter flow: book → chapter label → page or percent → typed note → save. Progress bar
   updates immediately. Note bodies render in Literata.

**Out of scope.** Streaks. Review scheduling. The night session. Voice. Any AI. The dashboard.
**No placeholder UI for any of them** — no greyed-out buttons, no "coming soon".

**Verification — `npm run prove-phase1`.** Against `fake-indexeddb` with a stubbed fetch: seed the
library and assert all 21 books exist with `totalPages: null` and no hardcoded page counts anywhere in
the source; enrich with a stubbed Open Library payload and assert covers and page counts land; enrich
with a **failing** fetch and assert every book is still usable and flagged for manual entry; assert a
low-confidence author match yields a cover but no page count; log a chapter against a `pages` book and
a `percent` book and assert `percentComplete` is correct for both and that the `pages` book's fields
are absent — not merely hidden — on the percent book. Then `npm run shoot` for the library, book
detail and log flow at 390×844 in both themes, plus an assertion that the manifest parses and declares
`display: standalone`.

---

### Phase 2 — the goal and the streaks

**Build.**
1. `src/lib/streaks.ts` — pure, current date passed in. **Tests written first**, covering the six
   cases the brief names plus the degenerate ones: empty log, single ancient day, duplicates,
   out-of-order entries, future-dated entries, and the "streak ending yesterday is still alive" rule.
2. Dashboard as the front door: big amber reading streak, today's book, one primary action, quiet
   review-streak line.
3. Daily goal = one chapter. The dashboard says in one glance whether today is done.
4. Celebration on chapter completion — bar fills, percent ticks up, brief restrained animation,
   honouring `prefers-reduced-motion`.
5. Auto theme: light before 19:00 local, dark after, with a manual toggle that persists and overrides
   until the next local midnight. `src/lib/theme.ts` pure and tested.

**Rule that must not be violated:** the reading streak breaks only on a missed chapter. Review
activity can never break it, and §6.3's two-function split is how that is guaranteed.

**Out of scope.** Review scheduling, night session, voice, AI.

**Verification — `npm run prove-phase2`.** The Vitest output for `streaks.test.ts` and
`theme.test.ts`, shown in full. Then a scripted 30-day simulation over the real data layer: reading on
some days, review sessions on others, a two-day gap, a double-logged day and a day with reviews but no
reading — asserting the reading streak and review streak independently for every day, and specifically
asserting that the review-only day did **not** extend the reading streak and that the reading streak
survived a night with no review session. Plus a Playwright pass asserting the dashboard renders dark
at 19:00 and light at 18:59 with the clock faked, that a manual override survives a reload, and that it
has expired on the next day. Screenshots of the dashboard in both themes, done and not-done.

---

### Phase 3 — the review scheduler

The phase that makes the app worth building.

**Build.**
1. `src/lib/scheduler.ts` — pure, **tests first**. Intervals, three-way grading, `buildSession`
   ordering and cap.
2. `reviews` and `sessions` tables, and the one-pending-row-per-note invariant.
3. Night session screen: due notes, oldest first, capped at 5, overdue prioritised, held-back count
   stated.
4. **The critical interaction.** Body hidden — not rendered — until reveal. Grade bar does not mount
   until reveal has happened.
5. Session complete → second celebration, review streak increments.
6. Nothing-due state, plainly stated, with an explicit review-early control.

**Out of scope.** Voice, AI grading.

**Verification — `npm run prove-phase3`.** The Vitest output in full, including: the exact due
sequence 1 / 4 / 11 / 25 / 55 for five consecutive `got it` grades (§4.1); `partial` repeating the
same interval; `missed` resetting to +1; the clamp at +30; a note graded `missed` five times having
exactly one pending review throughout and never spiralling; a note reviewed 9 days late scheduling
from the review date, not the due date; `buildSession` ordering with every tie-break; the cap holding
at 5 with 40 due and `heldBack === 35`; and `nothingDue` when the queue is empty.
Then a **Playwright** run against the real build that is the phase's real gate: seed notes due
tonight, open the night session, and assert the note body string is **absent from the entire DOM**
before the reveal tap and present after it; assert the grade bar cannot be reached before revealing;
grade three notes, kill the browser context mid-session, reopen, and assert exactly those three are
gone from the rebuilt queue and their grades survived. Screenshots of the hidden state, the revealed
state and the summary, in dark.
Then a **subagent review of the diff** against this spec: every requirement implemented, the
reveal-before-grade order unbypassable, and nothing outside this phase's scope changed. Correctness
gaps only, not style.

---

### Phase 4 — voice and the AI tutor

Two independent steps. **Ship A before starting B.**

#### Step A — voice input for notes

`src/lib/speech.ts` wraps `MediaRecorder`; audio is POSTed to `/api/transcribe` and the returned text
drops into the **editable** note field. Typing remains fully available — voice is a second door, not a
replacement.

Handled explicitly: microphone permission denied (falls back to typing with a one-line explanation,
never a dead end); recording longer than 3 minutes (auto-stops and submits what it has); transcription
failure (**the audio blob and any typed text are preserved**, and the user is offered a retry — losing
someone's spoken note is the one unforgivable failure in this phase).

#### Step B — AI recall grading

In the night session, **after the reveal**, the user may speak their recalled version. The attempt and
the original note go to `/api/grade`, which returns what was right, what was missed, and a **suggested**
grade. The user accepts or overrides. The model advises; it never decides — the grade written to the
database is always the one the user confirmed.

**Keys are server-side only.** `api/transcribe.ts` and `api/grade.ts` read from the environment; no key
is ever referenced in client code, and a build-time check greps the bundle to prove it.

**Graceful absence.** The client probes `/api/health` once per launch. Deployed as a static site with
no functions, both features hide themselves completely — no dead buttons — and Phases 1–3 are
untouched. This is what keeps the app deployable to GitHub Pages today and Vercel tomorrow.

**Out of scope.** Automatic grading without confirmation. Any client-side key. Streaming responses.

**Verification — `npm run prove-phase4`.** Unit tests with a mocked recorder and fetch: permission
denied yields the typing fallback; a 3-minute recording auto-stops; a transcription 500 preserves the
blob and the typed text and surfaces a retry; a malformed grade response falls back to manual grading;
`/api/health` absent hides both features entirely. A build-time assertion that no environment key name
appears in `dist/`. Screenshots of the recording state, the failure-with-retry state and the AI
suggestion with its accept/override controls.

---

## 11. Verification scripts

| Script | Proves | Phase |
|---|---|---|
| `prove-phase1` | 21 books seed with no hardcoded page counts; enrichment succeeds, fails safely, and refuses page counts on a weak match; both progress units log correctly | 1 |
| `prove-phase2` | Streak semantics across 30 simulated days; the two streaks cannot contaminate each other; the 19:00 switch and override expiry | 2 |
| `prove-phase3` | The 1/4/11/25/55 sequence; no spiral; late reviews reschedule from the review date; the cap holds; **the note body is absent from the DOM before reveal** | 3 |
| `prove-phase4` | Voice and AI failure paths never lose data; no key in the bundle; both features vanish when the API is absent | 4 |
| `shoot` | Every screen at 390×844, light and dark | all |

---

## Appendix A — the seeded library

Seeded with title, author and progress unit only. **No page counts are hardcoded** (§4.7) — they
arrive from Open Library in the browser, or from you.

| Title | Author |
|---|---|
| Buy Back Your Time | Dan Martell |
| Think Again | Adam Grant |
| Expert Secrets | Russell Brunson |
| Traffic Secrets | Russell Brunson |
| Think and Grow Rich | Napoleon Hill |
| The Psychology of Money | Morgan Housel |
| The Motive | Patrick Lencioni |
| The Five Dysfunctions of a Team | Patrick Lencioni |
| The 21 Irrefutable Laws of Leadership | John C. Maxwell |
| Your Next Five Moves | Patrick Bet-David |
| $100M Offers | Alex Hormozi |
| $100M Leads | Alex Hormozi |
| $100M Money Models | Alex Hormozi |
| This Is Marketing | Seth Godin |
| Crucial Conversations | Patterson, Grenny, McMillan, Switzler |
| Good to Great | Jim Collins |
| Supercommunicators | Charles Duhigg |
| Getting Things Done | David Allen |
| The 7 Habits of Highly Effective People | Stephen Covey |
| The AI-Driven Leader | Geoff Woods |
| I Will Teach You to Be Rich | Ramit Sethi |

All seed as `progressUnit: 'pages'`. Switching one to `percent` because you own the audiobook is a
single tap on the book's detail screen.

## Appendix B — deliberately not built

Social features, sharing, multi-user accounts, book recommendations, reading inside the app, note
highlights imported from anywhere, push notifications, cloud sync, and automatic AI grading without
human confirmation. Each is either out of scope forever per the brief, or impossible on iOS without a
server this project does not have.

---

## 12. Amendments adopted after design review

Four independent reviews were run against this spec before implementation, covering the scheduler,
the streak semantics, iOS PWA behaviour and the Open Library contract. These are the changes they
forced. Each one is now implemented and tested.

**Corrections to things this spec had wrong**

- **`maximum-scale=1` removed from the viewport.** It does not reliably stop iOS focus-zoom — the
  actual fix is 16px inputs, now enforced as a token-level CSS rule — and it disables pinch-zoom,
  which is an accessibility regression in an app whose entire purpose is reading.
- **The iOS status bar is `default`, not `black-translucent`.** `black-translucent` paints our own
  background under the status bar and iOS draws *white* glyphs over it — illegible on the cream light
  theme every single morning. The style is also only read at launch, so a 19:00 flip could never have
  restyled it anyway.
- **`onAccent` token added.** White text on the amber fill measures 3.74:1 in light and **2.02:1** in
  dark. Both fail AA. Button text is now near-black on amber in both themes, and the contrast audit
  covers the pair.
- **`Field` split into `Field` and `FieldGroup`.** A `<label>` forwards clicks to its first labelable
  descendant, so wrapping a stepper meant every tap anywhere in the field silently fired the "−"
  button. Multi-control fields now use a `role="group"` wrapper instead.
- **Open Library pacing raised from 350ms to 1s**, and third-party summaries, workbooks and study
  guides are rejected outright. A summary's title usually contains the real author's name, so it
  passes the author check and would otherwise attach the wrong cover.
- **Author matching keys on surnames, not all name tokens.** "Not Adam" shares the token "adam" with
  "Adam Grant" and was passing the confidence check.

**Additions this spec did not have**

- **A service worker.** Without one, "installs like an app" is true and "opens on a train" is not.
  Runtime caching: cache-first on the shell and on content-hashed assets, `/api/*` never cached,
  cross-origin left alone.
- **Note drafts persisted to `localStorage`** as you type, flushed synchronously on `pagehide` and on
  `visibilitychange → hidden`. iOS discards a backgrounded web app and relaunches it cold from
  `start_url`; losing a note typed one-handed at 6am is the most habit-breaking failure this app
  could have. `localStorage` specifically because it is synchronous, which an IndexedDB write on
  `pagehide` is not.
- **`navigator.storage.persist()` requested from the first tap**, with the result surfaced in
  Settings. WebKit deletes script-writable storage after 7 days without interaction; an installed
  home-screen app keeps its own counter, which the morning ritual resets. Installing is therefore a
  requirement, not a nicety, and the app says so.
- **`tzOffsetMinutes` stamped on every dated row.** Nothing reads it today. It is unindexed and free,
  and without it a future change to `DAY_ROLLOVER_HOUR` could never backfill history and a disputed
  streak would have no forensic trail.
- **The night session is a persisted entity** (Phase 3), not in-memory state. Because iOS relaunches
  cold on resume, an in-memory queue means locking the phone mid-recall returns a *different* five
  notes.
- **Grading is replay-safe** (Phase 3). The write re-reads the row inside the transaction and aborts
  if it is already graded, so a retried mutation is a no-op rather than a double advance up the
  ladder. Tap-to-reveal-then-grade with a slow write and an aggressive suspend is exactly where this
  happens.
- **A night with nothing due bridges the review streak** without incrementing it (Phase 3). With
  intervals of 1/3/7/14/30 a light week routinely has zero-due nights, and breaking the streak there
  punishes you for the scheduler's arithmetic rather than for your own behaviour.
- **`Streak.status`** is `'active' | 'at_risk' | 'broken'`, so three components cannot each re-derive
  "is this streak about to die" differently.
- **Future-dated entries are dropped entirely** from streak computation — they must never bridge a
  real gap.
- **Export and import move up to Phase 2**, not Phase 4. Deleting the home-screen icon deletes every
  note with no prompt and no recycle bin. Export uses `navigator.share` with a clipboard fallback,
  never `<a download href="blob:">`, which is broken in standalone WKWebView.

**Stated, not fixed**

- **There is no nightly reminder, and there cannot be one.** The night ritual wants a 9pm nudge, and
  a static PWA on iOS cannot deliver one: no notification triggers, no periodic background sync, and
  Web Push needs a server holding VAPID keys plus a cron. The app is somewhere you go at 7pm. If the
  reminder turns out to be the thing that makes the habit stick, that is a real backend, and it is a
  different project.
- **`getUserMedia` in an installed PWA is the biggest unknown in Phase 4.** A long-standing WebKit
  bug has it working on first launch and failing on subsequent ones until reboot. Validate it on a
  real iPhone before committing to in-app recording; the keyboard mic remains the fallback and costs
  nothing.
- **Vercel is the install target; GitHub Pages is preview only.** Browser storage is keyed to origin,
  so moving after you have installed and started writing notes orphans every one of them.

---

## 13. What the Phase 3 subagent review changed

The brief asks for a fresh-context review of each phase's diff before it is called done. These are
the findings that survived, and what each one now does instead. All are implemented and tested.

- **Sessions were being stranded open, and the review streak silently lost nights that were earned.**
  Tapping "Home" after grading two notes is a hash change, which fires neither `pagehide` nor
  `visibilitychange`; nothing closed the session, and `openOrResumeSession` only ever looks at today,
  so it became unreachable and uncounted. Now: a React unmount cleanup settles the live session,
  `settleOpenSessions` sweeps anything stale on launch, and the nothing-due and cap-reached paths bank
  the night before returning instead of short-circuiting past the recovery.
- **The persisted `revealed` flag was a bare boolean, and could reveal the wrong note.** The resumed
  item list is rebuilt from whatever is still pending, not from the stored index, so if the app was
  discarded between grading a row and clearing the flag, the *next* note came back already revealed —
  body in the DOM, grade bar mounted, for a note nobody tried to recall. That is exactly what §6.5
  exists to prevent. It is now `revealedReviewId`, and the reveal is restored only when the id matches
  the note actually being served.
- **Grading was two independent writes, and counted replays as work.** `recordGrade` now advances the
  review and the session in one transaction and returns null on a replay, so the summary cannot report
  six notes for five and an empty session cannot bank a streak night.
- **A resumed session stated the wrong held-back numbers.** It mixed a live count with frozen ones and
  could say "3 of 40" when 38 were due. The figures are recomputed at hydrate time — the cap is
  visible leniency, not a lie.
- **`NightSessionScreen` imported Dexie directly**, against §3 rule 2. Session resolution moved to
  `src/db/nightSession.ts`, which is also what made the atomic write natural rather than ad hoc.
- **A failed grade write locked the grade bar forever.** `setBusy(true)` had no `finally`.
- **The dashboard rendered the review streak before its exemption data loaded**, so a streak bridged by
  a nothing-due night flashed as zero.
- **The recall action was not gated on 19:00**, which §7.1 requires and which the whole "the dark
  screen is the signal" framing depends on. Before the switchover hour the count is still stated —
  "5 notes are waiting — recall opens at 19:00" — but the app does not push you into a night ritual at
  breakfast.
- **Grading across local midnight cost a streak night.** A grade at 00:05 credited yesterday's session
  while making the new day look busy, so it was neither active nor exempt. Reviews now carry
  `reviewedDayKey`, booked to the session's night, and the exemption reads that rather than the wall
  clock.
- **A dead `scheduleFirstReview` export** would have given a note two pending reviews if anything ever
  called it. Deleted.

The review also confirmed what it could not break: the 1/4/11/25/55 sequence, scheduling from the real
review date, the interval index staying inside 0–4 even for a corrupted row, the one-pending invariant
under a replay or a race, and — apart from the flag above — that no route, keyboard path or race
reaches a grade before a render.

---

## 14. Deploying it

**Vercel is the install target. GitHub Pages is preview only.** Browser storage is keyed to origin, so
moving after you have installed the app and started writing notes orphans every one of them. Decide
once, before the first note.

```
npm install
npm run build          # tokens, typecheck, bundle
npm run dev            # local
```

**Static hosting (GitHub Pages, Netlify drop, anywhere).** Phases 1–3 are the whole app and need no
server. Set `VITE_BASE_PATH` if it is served from a subdirectory. `/api/health` will 404, and voice
capture and AI grading hide themselves — the app is complete without them.

**Vercel, for Phase 4.** `vercel.json` is checked in; the functions in `api/` deploy automatically.
Set these environment variables in the project, server-side only:

| Variable | For | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI recall grading | Without it, `/api/grade` returns 503 and the feature hides |
| `TRANSCRIBE_URL` | Voice notes | Any OpenAI-compatible `/audio/transcriptions` endpoint |
| `TRANSCRIBE_KEY` | Voice notes | Bearer token for the above |
| `TRANSCRIBE_MODEL` | Voice notes | Optional, defaults to `whisper-1` |

Transcription is deliberately provider-neutral: Anthropic has no speech-to-text API, and the app
should not be married to whichever vendor is cheapest this year. OpenAI, Groq and a local Whisper
server all speak the same endpoint shape.

**On the phone.** Open the deployed URL in Safari, Share → Add to Home Screen, and open it from the
icon. Do that *before* entering data: an installed web app has its own storage, separate from the
Safari tab's, and Safari deletes a plain site's data after seven days without a visit.
