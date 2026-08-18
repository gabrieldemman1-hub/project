# SPEC — Reading & Spaced Repetition

A personal, single-user, offline-first PWA for reading books and remembering what's in them.
Written after a full interview with the product owner; every decision below was chosen deliberately,
and the ones that were close calls carry the reasoning so they can be re-litigated later on purpose
rather than by accident.

This document is self-contained. It names the files and interfaces to build, states what is out of
scope for each phase, and ends every phase with a verification step that proves the feature works.

---

## 1. What it is

Two loops that run every day:

- **Read.** Track progress through physical books, ebooks and audiobooks. Log time and position.
- **Review.** Turn what you read into cards, and answer them on a spaced schedule.

Both loops carry equal weight. The app's job is to make each of them a sub-thirty-second interaction,
and to be honest about which one you are neglecting.

It is not a social app, not an ebook reader, and it has no accounts.

## 2. Non-negotiables

- **Works offline.** Every interaction works in airplane mode. The only network call in the entire app
  is an optional book-metadata lookup, and its failure path is "the form is just a form".
- **One-handed.** Reading happens in bed and on trains; audiobooks happen while walking. Steppers and
  large tap targets first, keyboards second.
- **Never loses data.** Every write hits IndexedDB immediately. Killing the app mid-reading-session or
  mid-review must lose nothing.
- **Honest.** The app never quietly forgives a missed day or silently reschedules a card to flatter you.
  Where it is lenient, it is visibly lenient.

## 3. Globally out of scope

No accounts, no login, no cloud sync, no sharing, no social features, no AI-generated cards, no
in-app reading of book content, no Kindle highlight import, no barcode scanning, no push
notifications, no server of any kind. The data layer must stay clean enough that a sync layer could
be added in a later project without a rewrite — the same constraint the workout tracker was built
under — but nothing in this project builds toward it beyond keeping the schema sane.

---

## 4. Decisions taken in the interview

| Area | Decision | Why, and what it costs |
|---|---|---|
| Repo | New standalone repo, conventions copied from the workout tracker, no shared code | Two apps with nothing in common at runtime; drift in the primitives over time is accepted |
| Formats | Physical, ebook, audiobook | Audiobooks break page tracking, which is why progress is stored as percent |
| Card source | End-of-session prompt | Highest-quality cards, written while it's fresh; the step most at risk of being skipped, so it gets the fastest possible UI |
| Scheduler | Fixed interval ladder, with an FSRS-ready review log | Explainable in one sentence today, upgradeable to a real memory model later without losing history |
| Grading | Three buttons — Missed · Hard · Got it | Maps cleanly onto down / hold / up; fits one thumb |
| Backlog | Daily cap, oldest-first, with forward load-balancing | You always see a finishable number, and clearing it doesn't create a second spike next week |
| Progress unit | Percent canonical, entered in each format's native units | One comparable number across paper, ebook and audio |
| Dictation | The iOS keyboard's own mic, not the Web Speech API | Works offline, works in an installed PWA, zero code, cannot be broken by a Safari update |
| Audio capture | One-tap timestamp bookmark, no text | The only thing that works while walking; bookmarks become the agenda for the end-of-session prompt |
| Day complete | Two rings, both must close | Reading minimum AND today's review queue cleared; an empty queue counts as cleared |
| Day boundary | 4am local rollover | Reading at 12:30am counts for the day it feels like |
| Card types | Q&A and cloze | Cloze built by tapping words in a captured highlight — a five-second job |
| New cards | Reviewed once immediately, then enter the ladder at 1 day | Catches unanswerable cards when they're cheapest to fix |
| Lapses | Missed cards return at the end of the same session | You leave having actually re-learned it |
| Leeches | Suspend at 4 lapses and send back for rewriting | A card missed five times is a bug report, not a personal failing |
| Session timing | Two timestamps, never a ticking clock | Survives lock, backgrounding and app kill, because nothing is being counted |
| Library | Many active books; shelves Reading · Paused · Finished · Abandoned | Paused and Abandoned stop a dropped book from dragging pacing stats down |
| Reminders | App icon badge only | No server; a nudge when you glance at the home screen, not an alarm |
| Data safety | JSON export plus a home-screen nag counting days since last backup | Installing to the home screen is the real protection; the app says so |
| Adding books | Manual entry, with optional Open Library prefill when online | Purely additive; no API key, no account, no dependency |
| Look | Dark-first with a genuine light theme, semantic token pairs from day one | You will read outdoors; retrofitting light later means touching every component |
| Home screen | Two rings, one smart primary action | The app makes the choice at the moment you're least willing to |
| Stats | Consistency grid, 30-day due forecast, retention over time | Past, future, quality — three charts, not a dashboard |
| Search | Plain substring filter | Instant at this volume, zero dependencies; no stemming, and that limit is stated in the UI |
| Backdating | Up to 3 days, marked as entered late | Accurate data without being able to repaint a year |
| Pacing | Per-book projected finish date from actual recent pace | Derived from existing data, no new inputs |
| Deleting | Archive, never orphan; true deletion is a Settings-only, type-the-name action | Nothing is destroyed by a stray tap |

---

## 5. Stack

| Concern | Choice |
|---|---|
| App type | Installable PWA, added to the home screen |
| Framework | Vite + React + TypeScript |
| Styling | Tailwind, driven entirely by tokens |
| Storage | IndexedDB via Dexie, written on every meaningful interaction |
| State | Local React state + Dexie live queries. No Redux, no router library. |
| Tests | Vitest, with `fake-indexeddb` for anything touching the database |
| E2E / proof | Playwright, used only by the phase verification scripts |
| Charts | Recharts, and only in the stats phase |
| Backend | None |

**Dependency policy.** Every dependency must be justified in one sentence at the moment it is added.
The list above is the complete expected set; anything beyond it needs a conversation first. Note that
Open Library needs no dependency — it is a `fetch` call.

---

## 6. Architecture

Three hard rules, carried over from the workout tracker because they worked:

1. **`src/engine/` is pure.** No React, no Dexie, no `Date.now()` — the current day is always passed in
   as a parameter. Every scheduling, ring, streak and pacing rule lives here as a pure function over
   plain data. This is the tested core.
2. **All persistence goes through `src/db/`.** Components never import Dexie. They call query and
   mutation functions.
3. **Design tokens live in `src/styles/tokens.ts`.** No component ever hardcodes a colour, a spacing
   value, a radius or a shadow. Tokens are authored as semantic light/dark pairs from the first commit.

### File map

```
src/
  main.tsx
  App.tsx
  components/
    Button.tsx        Card.tsx          Screen.tsx        Stepper.tsx
    Ring.tsx          Sheet.tsx         Field.tsx         EmptyState.tsx
    ConfirmDialog.tsx
  features/
    home/       HomeScreen.tsx
    library/    LibraryScreen.tsx   BookScreen.tsx     AddBookScreen.tsx    ShelfPicker.tsx
    read/       ReadScreen.tsx      PositionInput.tsx  BookmarkButton.tsx   LogSessionSheet.tsx
    capture/    CaptureScreen.tsx   HighlightList.tsx  CardEditor.tsx       ClozeBuilder.tsx
    review/     ReviewScreen.tsx    CardFace.tsx       GradeBar.tsx         SessionSummary.tsx
    search/     SearchScreen.tsx
    stats/      StatsScreen.tsx     ConsistencyGrid.tsx ForecastChart.tsx   RetentionChart.tsx
    settings/   SettingsScreen.tsx  BackupPanel.tsx    DangerZone.tsx
  engine/
    types.ts    ladder.ts    schedule.ts   queue.ts     spread.ts    relearn.ts
    rings.ts    streak.ts    pace.ts       forecast.ts  retention.ts progress.ts
    sentence.ts
  db/
    db.ts       schema.ts    queries.ts    mutations.ts rollups.ts   search.ts   backup.ts   seed.ts
  lib/
    date.ts     ids.ts       router.ts     theme.ts     badge.ts     openLibrary.ts
    useLive.ts  format.ts
  styles/
    tokens.ts   index.css
  test/
    setup.ts    factories.ts
scripts/
  print-schema.ts  prove-library.ts  prove-resume.ts   prove-capture.ts  prove-backlog.ts
  prove-rings.ts   shoot-stats.ts    prove-backup.ts   prove-offline.ts  screenshot.ts
```

### Commands

- `npm run dev` — dev server
- `npm run test` — Vitest, run once
- `npm run build` — production build; must pass before any phase is called done
- `npm run <prove-*>` / `npm run <shoot-*>` — the phase verification scripts, one per gate

---

## 7. Data model

Dexie database `reading`, schema version 1. Every table has a string `id` (ULID-ish, from
`src/lib/ids.ts`) and an `updatedAt` epoch-millisecond number. `dayKey` is always a `'YYYY-MM-DD'`
string produced by `src/lib/date.ts` under the 4am rule — never derived at read time.

Declared in `src/db/schema.ts`, opened in `src/db/db.ts`.

### `books`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `title` | `string` | |
| `author` | `string` | |
| `format` | `'paper' \| 'ebook' \| 'audio'` | Decides which position input is shown |
| `totalPages` | `number \| null` | Required for `paper`, optional otherwise |
| `totalSeconds` | `number \| null` | Required for `audio` |
| `isbn` | `string \| null` | Only set when Open Library was used |
| `coverBlob` | `Blob \| null` | Fetched once at add time and stored, so covers survive offline |
| `shelf` | `'reading' \| 'paused' \| 'finished' \| 'abandoned'` | |
| `percent` | `number` | 0–100, denormalised from the latest session for fast list rendering |
| `targetFinishDay` | `DayKey \| null` | Optional, set by the user |
| `addedAt`, `startedAt`, `finishedAt` | `number \| null` | |
| `archivedAt` | `number \| null` | Set when shelved as finished or abandoned |
| `updatedAt` | `number` | |

`ebook` books with no `totalPages` accept percent directly. A `paper` book with no page count is
rejected at the form, because percent would be uncomputable.

### `readingSessions`

| Field | Type | Notes |
|---|---|---|
| `id`, `bookId` | `string` | |
| `startedAt`, `endedAt` | `number` | Absolute epoch ms. `endedAt` is null while in progress. |
| `durationSec` | `number` | `endedAt - startedAt`, or the user's corrected value |
| `startPercent`, `endPercent` | `number` | |
| `endPositionRaw` | `number` | Page number, percent, or seconds — whichever the format uses |
| `dayKey` | `DayKey` | Computed once, at write time, never recomputed |
| `enteredLate` | `boolean` | True for backdated entries |
| `durationCorrected` | `boolean` | True if the runaway-session guard was used |
| `updatedAt` | `number` | |

### `bookmarks`

Audio-first, but available for any format. A bookmark is a position with no text.

`id`, `bookId`, `sessionId`, `positionRaw`, `positionPercent`, `createdAt`, `resolvedAt | null`,
`resolvedHighlightId | null`.

A bookmark is *resolved* when it has been turned into a highlight, or explicitly dismissed, during
the end-of-session prompt. Unresolved bookmarks reappear at the top of the next capture prompt for
the same book, so nothing marked is silently lost.

### `highlights`

`id`, `bookId`, `sessionId | null`, `text`, `positionPercent | null`, `source: 'typed' | 'bookmark'`,
`createdAt`, `updatedAt`.

A highlight is raw captured text. It may produce zero, one or many cards. Deleting a card never
deletes its highlight.

### `cards`

| Field | Type | Notes |
|---|---|---|
| `id`, `bookId` | `string` | `bookId` is never null — every card has provenance |
| `highlightId` | `string \| null` | |
| `type` | `'qa' \| 'cloze'` | |
| `front`, `back` | `string` | For `qa` |
| `clozeText` | `string` | For `cloze`: the full sentence |
| `clozeMask` | `Array<[start, end]>` | Character ranges hidden on the front; all blanks hidden at once |
| `positionPercent` | `number \| null` | Where in the book it came from |
| `rung` | `number` | Index into the ladder, 0-based |
| `dueDay` | `DayKey` | |
| `reps`, `lapses` | `number` | |
| `lastReviewedDay` | `DayKey \| null` | |
| `introducedDay` | `DayKey` | |
| `suspendedAt` | `number \| null` | |
| `suspendReason` | `'leech' \| 'manual' \| null` | |
| `createdAt`, `updatedAt` | `number` | |

Scheduling state lives on the card so the due-queue query is a single index scan on `dueDay`.

### `reviews` — the append-only log

Never updated, never deleted. This is the table that makes a later FSRS migration possible, so it
records more than the ladder needs.

`id`, `cardId`, `reviewedAt`, `dayKey`, `rating: Rating`, `phase: 'intro' | 'scheduled' | 'relearn'`,
`elapsedDays`, `rungBefore`, `rungAfter`, `dueDayBefore`, `dueDayAfter`, `intervalDays`,
`durationMs`, `lapsesBefore`.

`elapsedDays` is the real interval — days between `lastReviewedDay` and the day the review actually
happened, which is not the same as the scheduled interval once you've been away. FSRS needs the real
one.

### `dayRollups`

Keyed by `dayKey`. A derived cache, rewritten on every activity so the home screen and the
consistency grid are single reads rather than aggregations.

`dayKey`, `readingSeconds`, `reviewsCompleted`, `reviewsScheduled`, `readingRingClosed`,
`reviewRingClosed`, `dayComplete`, `hadLateEntry`, `computedAt`.

Rebuildable from scratch by `src/db/rollups.ts#rebuildAll()`, which is exercised in tests so the
cache can never be the only copy of the truth.

### `settings`

Singleton row, id `'settings'`. See Appendix B for defaults.

### `meta`

Singleton row: `schemaVersion`, `lastBackupAt`, `lastBadgeCount`, `installPromptDismissedAt`.

### Notes on shape

- **No orphans.** Cards reference books; books are archived, never deleted, from the main UI.
  Deletion exists only in Settings and cascades explicitly (§10, Phase 2).
- **Denormalised `percent` on `books`** is a deliberate read optimisation. `src/db/rollups.ts` owns
  keeping it correct, and a test asserts it matches the latest session after arbitrary edits.
- **Sync-readiness, without building sync.** Every row has `id` and `updatedAt`; nothing uses
  auto-increment keys; no row is ever hard-deleted outside the explicit Settings path. That is enough
  for a later last-write-wins sync layer and costs nothing now.

---

## 8. The engine

Pure functions, no imports from React or Dexie, no clock access. `today: DayKey` is always a
parameter. This is the part that gets tweaked most often and therefore the part that is tested hardest.

### 8.1 Types — `src/engine/types.ts`

```ts
export type DayKey = string                     // 'YYYY-MM-DD', 4am-rolled
export type Rating = 'missed' | 'hard' | 'got_it'
export type ReviewPhase = 'intro' | 'scheduled' | 'relearn'

export interface Scheduling {
  rung: number
  dueDay: DayKey
  reps: number
  lapses: number
  lastReviewedDay: DayKey | null
  suspendedAt: number | null
  suspendReason: 'leech' | 'manual' | null
}

export interface GradeResult {
  next: Scheduling
  log: Omit<ReviewLogEntry, 'id' | 'cardId' | 'reviewedAt' | 'durationMs'>
  sentence: string          // one plain-English line, stored with the review
  becameLeech: boolean
}
```

### 8.2 The ladder — `src/engine/ladder.ts`

```ts
export const LADDER_DAYS = [1, 3, 7, 16, 35, 90, 180, 365] as const
export function intervalFor(rung: number): number
export function describeRung(rung: number): string   // '1 day', '3 days', '6 months'
```

### 8.3 Grading — `src/engine/schedule.ts`

```ts
export function grade(s: Scheduling, rating: Rating, today: DayKey, cap: DailyLoad): GradeResult
```

| Rating | Rung | Next due | Sentence shape |
|---|---|---|---|
| `got_it` | `rung + 1`, clamped to the top of the ladder | `today + interval(newRung)` | "Got it twice running — back in 7 days." |
| `hard` | unchanged | `today + interval(rung)` | "Held at 3 days." |
| `missed` | `max(0, rung - 2)` | `today + 1` | "Missed — back to tomorrow, and you'll see it again before you finish." |

Additional rules, in this order:

1. **Lapse counting.** `missed` increments `lapses`. Nothing else does.
2. **Leech guard.** When `lapses` reaches **4**, the card is suspended with reason `leech`, removed
   from all future queues, and surfaced in the *Needs rewriting* list with its source highlight,
   book and position attached. Rewriting it resets `rung`, `reps` and `lapses` to zero and clears
   the suspension. This is the only automatic suspension in the app.
3. **A drop of two rungs, not to zero.** A card at 90 days that you miss returns at the 7-day rung
   after its relearn, not at day one. Missing a mature card is information, not a reset.
4. **No overdue bonus.** A card seen 40 days late and answered correctly advances exactly one rung.
   The real elapsed interval is recorded in the log for a future FSRS fit, but the ladder ignores it.
   Simplicity beats a rule that can't be explained in a sentence.
5. **Load balancing** is applied on top, per §8.5.

### 8.4 The daily queue — `src/engine/queue.ts`

```ts
export interface QueueInput {
  cards: ScheduledCard[]      // not suspended
  today: DayKey
  dailyCap: number            // default 30
}
export interface QueueResult {
  queue: ScheduledCard[]      // ordered, length <= dailyCap
  deferred: number            // due but over the cap
  oldestDeferredDay: DayKey | null
}
export function buildQueue(input: QueueInput): QueueResult
```

Ordering: **oldest `dueDay` first**, tie-broken by `rung` ascending (weakest cards first), then by
`id` so the order is deterministic and testable. Cards due today or earlier are eligible; nothing
future is ever pulled forward.

When `deferred > 0` the review screen shows a single quiet line — *"30 of 92 today. The rest keep."* —
and Settings offers a **Clear the backlog** control that runs the same queue with the cap lifted.
Overdue cards are never punished for having waited: the grade function does not know how late a
card is.

### 8.5 Forward load balancing — `src/engine/spread.ts`

```ts
export function balance(target: DayKey, rung: number, upcoming: Record<DayKey, number>, cap: number): DayKey
```

Applied whenever a new `dueDay` is computed, so a big reading week doesn't detonate five weeks later.

- Only applies to intervals of **7 days or more** (`rung >= 2`). Short intervals are left alone.
- Searches a window of **±2 days** around the target and picks the day with the fewest cards already
  due, tie-broken toward the *earlier* day so the schedule drifts tighter rather than looser.
- Never moves a card earlier than tomorrow, and never moves it if every day in the window is already
  under `cap * 0.75`.
- Deterministic. No randomness anywhere in the engine — it would make the tests unwritable and the
  behaviour unexplainable.

### 8.6 In-session relearning — `src/engine/relearn.ts`

```ts
export interface SessionState {
  pending: string[]          // card ids, initial pass
  relearn: string[]          // card ids missed today, must be cleared
  seen: Record<string, number>   // card id -> times shown this session
  setAside: string[]         // hit the in-session miss limit
}
export function next(state: SessionState): { cardId: string | null; phase: ReviewPhase }
export function record(state: SessionState, cardId: string, rating: Rating): SessionState
```

- A missed card goes to the back of the `relearn` list. The initial pass finishes first.
- Answering a relearn card `hard` or `got_it` clears it from the session. **It does not re-grade the
  schedule** — the card is already set to tomorrow at a reduced rung. Relearn repeats are practice,
  and are logged with `phase: 'relearn'` so they never distort retention stats.
- **Infinite-loop guard:** a card missed **3 times within one session** is set aside for the day with
  a line explaining why. Without this, one badly written card can trap you in a session forever.
- The session is **clear** when `pending` and `relearn` are both empty. Leaving early is safe:
  every graded review was written to IndexedDB the moment it was answered.

### 8.7 Rings and the day — `src/engine/rings.ts`

```ts
export interface RingInput {
  readingSeconds: number
  readingTargetSeconds: number      // default 15 min
  reviewsCompleted: number
  reviewsScheduled: number          // size of today's capped queue
  sessionClear: boolean
}
export function computeRings(i: RingInput): {
  reading: { fraction: number; closed: boolean }
  review:  { fraction: number; closed: boolean }
  dayComplete: boolean
  sentence: string
}
```

- The reading ring closes at or above the target. It keeps filling past 100% visually but is capped
  at 1 for the purposes of `closed`.
- The review ring closes when the session is clear — initial pass done *and* relearns cleared.
- **A day with zero cards scheduled counts as a closed review ring.** You cannot be punished for
  having nothing to do.
- `dayComplete` requires both. A half-day renders as a half-day; there is no partial credit and no
  combined score.

### 8.8 Streak — `src/engine/streak.ts`

```ts
export function streak(rollups: DayRollup[], today: DayKey): {
  current: number; longest: number; lastCompleteDay: DayKey | null
}
```

Counts consecutive `dayComplete` days ending today or yesterday — today still being in progress must
not read as a broken streak before 4am tomorrow. No grace days, no freezes: the consistency grid
carries the nuance, the streak stays a hard number.

### 8.9 Pacing — `src/engine/pace.ts`

```ts
export function project(book: BookPace, sessions: SessionPace[], today: DayKey): {
  minutesPerDay: number | null
  percentPerDay: number | null
  projectedFinishDay: DayKey | null
  sentence: string
}
```

- Uses that book's sessions from the **last 14 days**. Fewer than 2 sessions returns nulls and the
  sentence *"Not enough reading yet to guess a finish date."*
- Days with no session for this book count as zero, not as missing — otherwise a book you touch once
  a fortnight projects as finishing next week.
- With a `targetFinishDay` set, the sentence states the gap: *"At 18 min a day, done 4 September —
  nine days past your target."*
- Paused and abandoned books are never projected.

### 8.10 Forecast and retention — `src/engine/forecast.ts`, `src/engine/retention.ts`

```ts
export function forecast(cards: ScheduledCard[], today: DayKey, days: number): Array<{ day: DayKey; count: number }>
export function retention(reviews: ReviewLogEntry[], today: DayKey, weeks: number): Array<{ weekStart: DayKey; rate: number; n: number }>
```

Retention counts `got_it` and `hard` as successes over all reviews with `phase: 'scheduled'` —
intro and relearn reviews are excluded, because including them would let a bad week look like a good
one. Weeks with fewer than 5 reviews are returned with their `n` so the chart can render them faintly
rather than pretending they're signal.

### 8.11 Progress conversion — `src/engine/progress.ts`

```ts
export type Position =
  | { kind: 'page'; page: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'seconds'; seconds: number }

export function toPercent(book: BookLength, pos: Position): number     // clamped 0-100, 1dp
export function fromPercent(book: BookLength, percent: number): Position
export function describePosition(book: BookLength, pos: Position): string  // 'p. 214 of 380', '6h12m of 11h40m'
```

Rounding is to one decimal place, and `toPercent` is clamped — a mistyped page 3800 becomes 100%,
never 1000%.

### 8.12 Sentences — `src/engine/sentence.ts`

Every engine output that reaches the screen carries a one-line plain-English explanation, and that
sentence is stored alongside the result rather than regenerated at render time. If a rule cannot be
explained in one sentence, the rule is wrong. This is a hard requirement, tested: the suite asserts
that every branch of `grade`, `computeRings` and `project` returns a non-empty sentence under 90
characters.

### 8.13 Dates — `src/lib/date.ts`

```ts
export const ROLLOVER_HOUR = 4
export function dayKeyOf(at: number): DayKey        // local time, 4am boundary
export function addDays(d: DayKey, n: number): DayKey
export function diffDays(a: DayKey, b: DayKey): number
export function isBackdatable(d: DayKey, today: DayKey): boolean   // within 3 days, not future
```

**Timezone honesty.** `dayKey` is computed from the device's local time *at the moment of writing*
and then stored. Historical rows are never re-bucketed when you travel. A day spent flying east may
be short and a day flying west may be long; the app accepts this rather than pretending a calendar
is a physics problem.

---

## 9. Screens

Navigation is a hash router in `src/lib/router.ts` — four routes plus modals. No router dependency.

### Home — `features/home/HomeScreen.tsx`

- **Two rings**, side by side in the upper third: reading minutes and today's review queue. Both
  always visible, so a neglected loop is never off-screen.
- **One primary action** in the thumb zone, resolving to whichever loop is more urgent: *Review 12
  cards* when the queue is non-empty and the reading ring is closed or the day is young; *Read* when
  reviews are clear. The other loop sits directly beneath it as a quiet secondary. The rule for which
  wins is in the engine, tested, and explained by the button's own subtitle.
- **Streak** as a single number with the current consistency strip beneath it.
- **Active books strip** — the `reading` shelf, each with percent and projected finish.
- **Backup nag** — appears only once `lastBackupAt` is more than 7 days old, and gets louder past 14.

### Read — `features/read/ReadScreen.tsx`

- Pick a book from the `reading` shelf, or resume the in-progress session, which is the default
  state if one exists.
- **Start** writes `startedAt` immediately. **Stop** writes `endedAt` and opens the position input.
- **Position input** (`PositionInput.tsx`) is format-aware: a page stepper for paper, a percent
  stepper for ebooks, an hours/minutes stepper for audio. Steppers first, tap-to-type as fallback.
  Increments: 1 page / 1% / 1 minute on tap, 10× on hold.
- **Bookmark button** (`BookmarkButton.tsx`) is a single full-width target, present for every format
  but dominant for audio. One tap stamps the current position and nothing else. It confirms with a
  count, not a dialog — *"3 marks this session"* — because you are walking.
- **Log a past session** (`LogSessionSheet.tsx`) — duration, date within the last 3 days, and end
  position, for reading that happened away from the app. Records `enteredLate: true`.
- **Runaway guard.** Any open session older than 4 hours prompts on next open: *"This session has
  been running since 9:14pm. How long did you actually read?"* with an editable duration defaulting
  to the reading target. Sets `durationCorrected: true`.

### Capture — `features/capture/CaptureScreen.tsx`

Shown automatically when a reading session ends, and reachable later from the book screen.

- Any unresolved bookmarks are listed first with their positions — *"You marked 0:41:20 and 1:07:55"* —
  each expanding into a text field. This is the agenda.
- A free **"What do you want to remember?"** field beneath, always focused-on-tap and never
  auto-focused (an auto-opening keyboard on a phone you just put down is hostile).
- Each highlight has one action: **Make a card**.
- `CardEditor.tsx` offers Q&A or cloze. `ClozeBuilder.tsx` renders the highlight as tappable words;
  tapping toggles a word into the mask, and the preview shows the front exactly as review will.
- Every new card gets **one immediate review** before you leave the screen, logged with
  `phase: 'intro'`. It does not count toward the daily cap and does not count toward retention.
- Skipping is a first-class action. **Done** is always available and never guilt-trips.

### Review — `features/review/ReviewScreen.tsx`

- Card front, large. Tap anywhere to reveal.
- `GradeBar.tsx`: three full-height buttons, **Missed · Hard · Got it**, in the bottom third.
- After grading, a single line of engine sentence appears for ~600ms — *"Back in 7 days."*
- Provenance is available but never in the way: the book title sits small at the top, and the source
  highlight is revealed with the answer.
- `SessionSummary.tsx` at the end: counted, graded, relearned, set aside, and the review ring closing.

### Library — `features/library/`

- `LibraryScreen.tsx` — shelves as a segmented control: Reading · Paused · Finished · Abandoned.
- `BookScreen.tsx` — progress, projected finish, sessions, highlights, cards, and the shelf control.
- `AddBookScreen.tsx` — format first (it decides the rest of the form), then title/author/length.
  A search field offers Open Library prefill; it is visibly optional and silently absent offline.

### Search — `features/search/SearchScreen.tsx`

One field, results grouped by cards, highlights and books. States its own limitation in the empty
state: *"Matches exact text. 'attend' won't find 'attention'."*

### Stats — `features/stats/StatsScreen.tsx`

Three charts, no more. Consistency grid (~90 days, coloured by which rings closed, late-entered days
marked distinctly), 30-day forward due forecast, and retention by week.

### Settings — `features/settings/SettingsScreen.tsx`

Reading target, daily review cap, theme (system/light/dark), backup export and import, *Needs
rewriting* list, *Clear the backlog*, and `DangerZone.tsx` for true deletion.

---

## 10. Visual direction

Dark-first, minimal, quietly premium — a sibling to the workout tracker, not a twin.

- **Dark:** near-black ground around `#0A0A0B`, cards a touch lighter. Layered dark, not flat black.
- **Light:** warm paper, around `#FAF8F4`, with near-black ink. A real theme, not an inversion.
- **Accent:** one only. A cool white with a faint blue cast in dark; a deep ink-blue in light. A
  single muted red is reserved exclusively for lapses, leeches and the stale-backup warning.
- **The glow:** soft outer glow in the accent, in dark theme only, on at most two elements per screen
  — the closing ring, the primary action. Light theme substitutes a soft elevation shadow.
- **Type:** one characterful face for numbers (minutes, percent, intervals, counts) with tabular
  figures so digits don't jump. A plain, highly legible face for prose — and card text is prose, set
  at a genuinely readable size, because you will read thousands of words of it.
- **Layout:** generous negative space. Primary actions in the bottom third. Nothing important in the
  top corners. Safe-area insets respected.
- **Motion:** restrained. Rings fill smoothly, a graded card settles out. Respect
  `prefers-reduced-motion`.
- **Quality floor:** legible at arm's length, minimum 44px touch targets, visible keyboard focus,
  WCAG AA contrast in **both** themes, enforced by an automated contrast audit over the token pairs.

Tokens are semantic (`--surface`, `--surface-raised`, `--ink`, `--ink-quiet`, `--accent`,
`--accent-glow`, `--warn`), each defined as a light/dark pair in `src/styles/tokens.ts` and emitted as
CSS custom properties. Components reference roles, never values, and never a theme name.

---

## 11. Edge cases and honest limitations

Stated here so no phase can quietly fail to handle them.

| Situation | Behaviour |
|---|---|
| Miss a day | Streak breaks, grid shows a gap, nothing else changes. No forgiveness mechanic, no freeze. |
| Miss a week | 90 due, 30 shown, oldest first; the rest keep. Clearing today's 30 doesn't create a spike next week, because every new due date is load-balanced. |
| Reading at 12:30am | Counts for the previous calendar day, per the 4am rollover. |
| Review at 1am | Same day as the evening before. It cannot empty tomorrow's queue. |
| Travel across timezones | `dayKey` is stamped at write time from local time and never recomputed. A short day or a long day is accepted. |
| Forgot to stop the timer | Sessions over 4 hours prompt for a corrected duration and are marked `durationCorrected`. |
| Read away from the phone | Backdate up to 3 days; marked `enteredLate` and rendered distinctly in the grid. |
| Audiobook while walking | One-tap bookmark, no text, no keyboard. Unresolved bookmarks reappear next capture. |
| Dictation | Use the iOS keyboard's mic in any capture field. The app never touches the Web Speech API — on iOS it needs network, cuts off at pauses, and has a history of breaking in installed PWAs. |
| A card you keep failing | Suspended at 4 lapses, sent to *Needs rewriting* with its highlight, book and position. |
| A card you fail 3 times in one session | Set aside for the day with an explanation, so a bad card can't trap the session. |
| Book abandoned mid-way | Shelf it Abandoned; it stops appearing in pacing and on the home strip, and its cards keep coming up. |
| Deleting a book | Only from Settings, only by typing the title, and the confirmation states exactly what goes: *"34 cards, 61 highlights, 12 sessions."* |
| App killed mid-reading-session | `startedAt` is already on disk; reopening resumes the running session. |
| App killed mid-review | Every grade was written when it was tapped. Reopening rebuilds the queue minus what was answered. |
| Offline forever | Everything works. Only Open Library prefill and first-time cover fetch need network, and both degrade to nothing. |
| Safari eviction | IndexedDB is evicted after 7 days of disuse for sites **not** installed to the home screen. Installing is the actual protection, and Settings says so in plain words next to the export button. |
| Reminders | The app icon badge shows due count, refreshed when the app runs. There is no alarm, and the app does not pretend otherwise. Real push would need iOS 16.4+, an install, and a server holding VAPID keys — which this project does not have. |
| Backup covers | Cover images are excluded from the JSON export to keep it small and readable; they refetch when online. Stated at the export button. |
| Import | Replace-all, never merge. Auto-exports the current database first, then confirms with row counts. |

---

## 12. Build phases

One phase per session. A phase is done when its gate has been run and its **evidence shown** — not
when the code looks right. Tests and `npm run build` must pass before any phase is called complete.
Every gate below is end-to-end: it exercises the feature through the real data layer and proves the
outcome, rather than asserting that a function was called.

---

### Phase 1 — Skeleton, tokens, schema

**Build.** Vite + React + TS + Tailwind scaffolded. `src/styles/tokens.ts` with the full semantic
light/dark pairs from §10, emitted as CSS custom properties, plus `src/lib/theme.ts` following the
system setting with a manual override. Dexie schema for all eight tables in `src/db/schema.ts`,
opened in `src/db/db.ts`. `src/lib/date.ts` complete with the 4am rule. `src/lib/ids.ts`,
`src/lib/router.ts`. Component primitives: `Button`, `Card`, `Screen`, `Stepper`, `Ring`, `Field`,
`Sheet`, `EmptyState`. Home screen renders both rings at zero and a real empty state.

**Out of scope.** No books can be added. No reading, no cards, no reviews, no stats, no PWA manifest,
no service worker, no Open Library. `Ring` renders a fraction it is handed and knows nothing about
where the number came from.

**Gate.** `npm run test` green (date helper: 4am boundary, backdate window, `addDays`/`diffDays`
across a DST change). `npm run build` passes. `npm run print-schema` prints every table, its indexes,
and its declared fields. `npm run screenshot` produces the home screen at 390×844 in **both** themes,
and the contrast audit reports every token pair at AA or better in both.

---

### Phase 2 — Library

**Build.** `AddBookScreen` with format-first entry and per-format length validation.
`src/lib/openLibrary.ts` — ISBN and title lookup, 4-second `AbortController` timeout, returns `null`
on any failure, never throws into the UI; cover fetched once and stored as a blob.
`LibraryScreen` with the four shelves, `BookScreen`, shelf transitions, archive-on-finish.
`DangerZone.tsx` with type-the-title deletion and a counted cascade. `src/db/mutations.ts` and
`src/db/queries.ts` established as the only path to Dexie.

**Out of scope.** No reading sessions, no progress beyond the initial 0%, no cards, no search,
no pacing, no rings that move.

**Gate.** `npm run prove-library` — a headless script against `fake-indexeddb` that adds a book of
each of the three formats, moves one through Reading → Paused → Reading → Finished asserting
`archivedAt` and shelf at each step, attempts an Open Library lookup with the network stubbed to
fail and asserts the book is still added, then deletes a book with 3 cards and 5 highlights attached
and prints the cascade counts before and after, asserting zero orphans remain in any table.
Screenshots of Add Book and each populated shelf at 390×844, both themes.

---

### Phase 3 — Reading sessions

**Build.** `ReadScreen` with timestamp-in/timestamp-out sessions. `PositionInput` per format with
steppers and tap-to-type. `engine/progress.ts` with full conversion and clamping.
`BookmarkButton` writing position-only bookmarks. `LogSessionSheet` for backdating within 3 days.
The 4-hour runaway guard. `src/db/rollups.ts` maintaining `dayRollups` and the denormalised
`books.percent` on every write.

**Out of scope.** No capture prompt yet (a finished session returns to Home), no cards, no rings
closing, no streak, no pacing.

**Gate.** `npm run prove-resume` — a **Playwright** run against the real dev build: start a reading
session, log a position, **kill the browser context mid-session**, reopen, and assert the running
session resumes with `startedAt` intact and the logged position present. Then a second pass that
fast-forwards a session's `startedAt` by 5 hours and asserts the runaway prompt appears and the
corrected duration is what gets stored. Plus unit tests for `toPercent`/`fromPercent` round-tripping
across all three formats including the clamp cases. Show the actual output.

---

### Phase 4 — Capture and card authoring

**Build.** `CaptureScreen` opening automatically at session end, unresolved bookmarks listed first
as the agenda. Highlight entry (plain textareas — the keyboard mic is the dictation story).
`CardEditor` for Q&A. `ClozeBuilder` — tap words to build the mask, live front preview. The immediate
first review of each new card, logged with `phase: 'intro'`. Bookmark resolution and carry-forward.

**Out of scope.** No scheduler — new cards are written with `rung: 0` and `dueDay: today + 1` by a
placeholder that Phase 5 replaces. No review screen, no queue, no daily cap, no leeches. One mask set
per cloze card; sibling cards from one sentence are out of scope for the whole project.

**Gate.** `npm run prove-capture` — end a reading session with 2 bookmarks, resolve one into a
highlight, dismiss the other, assert the dismissed one reappears on the next session's capture screen
and the resolved one does not. Build a cloze from a highlight, assert the rendered front hides exactly
the masked ranges and the back is the full sentence. Assert every new card has a non-null `bookId`
and an `intro` review row. Screenshots of the capture prompt, the Q&A editor and the cloze builder.

---

### Phase 5 — The scheduler engine

**Build.** `engine/ladder.ts`, `engine/schedule.ts`, `engine/queue.ts`, `engine/spread.ts`,
`engine/relearn.ts`, `engine/sentence.ts`. Pure, no persistence, not yet wired to any screen.
**Write the tests first.**

**Out of scope.** No UI at all. No rings, no streak, no stats. Nothing in `src/db/` changes.

**Gate.** The full Vitest output, passing, covering at minimum: every rating at every rung including
both clamps; the two-rung drop; lapse counting; leech suspension at exactly 4 and not at 3; the
queue's oldest-first ordering with its tie-breaks; the cap and the `deferred` count; load balancing
inside and outside the ±2 window, its 7-day floor, its `cap * 0.75` threshold and its determinism
under repeated runs; relearn ordering; relearn not re-grading the schedule; the 3-miss set-aside;
and an assertion that every branch of `grade` returns a sentence under 90 characters. Show the output.

---

### Phase 6 — Review, wired

**Build.** `ReviewScreen`, `CardFace`, `GradeBar`, `SessionSummary`. The queue built from real cards.
Every grade written to IndexedDB at the moment it is tapped, with its full `reviews` log row.
Phase 4's placeholder scheduling replaced by `engine/schedule.ts`. *Needs rewriting* list in Settings.
*Clear the backlog* control.

**Out of scope.** No rings closing yet, no streak, no badge, no stats.

**Gate.** `npm run prove-backlog` — seed 92 cards due across the past 8 days, assert the queue is
exactly 30, oldest-first, and reports 62 deferred. Grade all 30, assert each has a `reviews` row with
correct `elapsedDays` against its real last review, then **assert no single day in the next 40 has
more than the cap**, proving load balancing prevented the echo spike. Separately: a Playwright run
that grades 5 cards, kills the browser context mid-session, reopens, and asserts exactly those 5 are
gone from the rebuilt queue and their grades survived. Plus: miss one card three times and assert it
is set aside rather than re-queued.

---

### Phase 7 — Rings, streak, pacing, search

**Build.** `engine/rings.ts`, `engine/streak.ts`, `engine/pace.ts` wired into a real Home screen: two
rings, the smart primary action, the streak, the active books strip with projected finish dates.
`src/db/search.ts` and `SearchScreen`. The consistency strip on Home.

**Out of scope.** No charts (Phase 8), no PWA, no backup, no badge.

**Gate.** `npm run prove-rings` — a scripted 21-day simulation over the real data layer: some days
reading only, some reviews only, some both, one day with zero cards due, one backdated entry, and a
6-day gap. Assert for every day whether each ring closed and whether the day counted; assert the
zero-due day counted as a closed review ring; assert the streak broke exactly at the gap and resumed
correctly; assert the backdated day is flagged `hadLateEntry`. Then wipe `dayRollups`, run
`rebuildAll()`, and assert byte-identical results — proving the cache is never the only copy of the
truth. Screenshots of Home in both themes with a real streak, and of a search returning cards,
highlights and books.

---

### Phase 8 — Stats

**Build.** Recharts. `ConsistencyGrid` (~90 days, coloured by rings closed, late entries marked),
`ForecastChart` (30 days forward), `RetentionChart` (by week, thin weeks rendered faintly).
`engine/forecast.ts`, `engine/retention.ts`.

**Out of scope.** Three charts and nothing more. No per-book dashboards, no export of charts, no
date-range picker.

**Gate.** Unit tests: forecast counts match a hand-built due distribution including suspended cards
being excluded; retention excludes `intro` and `relearn` rows and returns `n` per week.
`npm run shoot-stats` seeds ~6 months of realistic data and screenshots all three charts at 390×844
in both themes, including the empty state for a fresh install.

---

### Phase 9 — PWA, badge, backup

**Build.** Manifest, icons, service worker with a precache of the app shell and a cache-first
strategy — the app must be fully functional from the home-screen icon in airplane mode.
`src/lib/badge.ts` — `navigator.setAppBadge` with the due count, feature-detected, updated on launch
and after every review, cleared when the queue empties. `src/db/backup.ts` — JSON export via the
share sheet, replace-all import that auto-exports first and confirms with row counts, `lastBackupAt`
tracking, and the Home nag at 7 and 14 days. The Safari-eviction explanation next to the export
button.

**Out of scope.** No push notifications, no cloud target, no auto-export, no cover images in the
export file.

**Gate.** `npm run prove-backup` — round-trip a database of every table through export and import and
assert deep equality of every row except cover blobs, which must be absent from the file and null
after import. Assert import of a malformed file fails safely with the original data intact.
`npm run prove-offline` — Playwright: install-equivalent load, go offline, then cold-load and complete
a full reading session, a capture, and a review with **zero network requests** succeeding. Then, by
hand: install to the home screen, put the phone in airplane mode, and do a real session.

---

### Phase 10 — Polish

**Build.** Walk every screen against §10 in both themes and fix what doesn't match. Run the contrast
audit over the real rendered screens, not just the token pairs. Check touch targets, safe-area insets,
focus rings, `prefers-reduced-motion`, and tabular figures on every number.

**Out of scope.** No new features. Anything discovered that isn't polish gets written down, not built.

**Gate.** Before-and-after screenshots of every screen at 390×844 in both light and dark, a passing
contrast audit over rendered output, and a written critique of each screen against §10 naming what
was changed. Then the real test: a full week of daily use on the phone before this is called done.

---

## 13. Verification scripts

| Script | Proves | Phase |
|---|---|---|
| `print-schema` | Every table, index and field exists as specified | 1 |
| `screenshot` | Any screen at 390×844 in both themes, plus the token contrast audit | 1, all |
| `prove-library` | Shelf transitions, offline-safe lookup, zero-orphan deletion | 2 |
| `prove-resume` | A killed reading session resumes intact; the runaway guard corrects duration | 3 |
| `prove-capture` | Bookmarks carry forward; cloze masks render correctly; provenance is never null | 4 |
| `prove-backlog` | The cap holds, ordering is oldest-first, and no echo spike forms | 6 |
| `prove-rings` | 21 simulated days of ring and streak behaviour; rollups are rebuildable | 7 |
| `shoot-stats` | All three charts with realistic and empty data | 8 |
| `prove-backup` | Export/import round-trips exactly; malformed import is safe | 9 |
| `prove-offline` | A full session completes cold with no network | 9 |

---

## Appendix A — `CLAUDE.md` for the new repo

```markdown
# Reading & spaced repetition

Personal reading tracker and SRS. Single user, offline-first PWA. Full spec in @SPEC.md.

## Commands
- `npm run dev` — dev server
- `npm run test` — Vitest
- `npm run build` — production build, must pass before any phase is called done

## Architecture
- Scheduling, rings, streak and pacing logic live in `src/engine/` as pure functions. No React, no
  Dexie, and no clock access — `today` is always a parameter. This is the tested core.
- All persistence goes through `src/db/`. Components never touch Dexie directly.
- Design tokens live in `src/styles/tokens.ts` as semantic light/dark pairs. IMPORTANT: never
  hardcode a colour or spacing value in a component, and never reference a theme name.

## Rules
- YOU MUST write a review to IndexedDB the moment it is graded, and a reading session's start
  timestamp the moment it begins. Never batch until the end.
- YOU MUST run tests and the production build before reporting a phase complete.
- Never add a dependency without telling me why in one sentence.
- Position and duration inputs are steppers first, keyboards second. This is used one-handed.
- Dictation means the iOS keyboard's mic. Do not use the Web Speech API.
- No randomness in `src/engine/`. Ever.
- Every engine result that reaches the screen carries a one-sentence explanation, stored with it.
- When compacting, always preserve SPEC.md's phase status and the list of modified files.
```

## Appendix B — Settings defaults

| Setting | Default | Range |
|---|---|---|
| Reading target | 15 minutes | 5–120 |
| Daily review cap | 30 cards | 10–200, or unlimited via *Clear the backlog* |
| Theme | System | System / Light / Dark |
| Day rollover | 4am | Fixed in v1; a constant in `src/lib/date.ts`, not a setting |
| Leech threshold | 4 lapses | Fixed in v1 |
| In-session miss limit | 3 | Fixed in v1 |
| Backdate window | 3 days | Fixed in v1 |
| Backup nag | 7 days, louder at 14 | Fixed in v1 |
| Runaway session guard | 4 hours | Fixed in v1 |

Values marked fixed are single named constants in the engine or `src/lib/date.ts`, not scattered
literals, so promoting one to a real setting later is a one-line change plus a settings row.

## Appendix C — Deliberately not built

Kindle highlight import, barcode scanning, FSRS, push notifications, cloud sync, cloze sibling cards,
free-recall self-graded cards, full-text search with stemming, multi-user anything, reading inside the
app, AI-generated cards, and a combined effort score that hides which loop you're neglecting. Each was
considered during the interview and rejected for a stated reason. The `reviews` log is deliberately
richer than the ladder needs so that FSRS specifically remains possible later without losing history.
