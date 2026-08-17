# PLAN — Workout Tracker

Living document. Phase status at the bottom is the source of truth for what is built.

Spec: [BRIEF.md](./BRIEF.md) · Working agreement: [CLAUDE.md](./CLAUDE.md)

---

## 1. Decisions you made

These came from questions asked before planning. They're settled unless you say otherwise.

| # | Question | Your answer | What I'm building |
|---|---|---|---|
| A-1 | Missed days | Skip it explicitly, and don't progress the exercise | Weekdays stay locked (Mon/Thu = A, Tue/Fri = B, Wed/Sat = C). A **Skip today** control records a `skipped` session. Skipped sessions are invisible to the engine — the next Day B reads your last *completed* Day B and repeats the same prescription. You never get punished or advanced for a day you didn't train. |
| A-2 | Rep-floor vs. RIR conflict | Below-floor wins → drop weight | If your top set lands under the rep target's floor, load drops one increment even if you reported 3+ in the tank. This is a hard override that beats every other load rule. |
| A-3 | Deload rounding | Round to nearest increment | `round(lastWeight × 0.9 / increment) × increment`, ties round **down**. 150 lb → 135. 145 lb → 130. |
| A-4 | Week counter | Manual | A **Start new mesocycle** button in Settings. Week = calendar weeks elapsed since that date, 1–6. Week 6 is the deload. When week 6 finishes the home screen says "Mesocycle complete" and waits for you to tap start — it will not roll over on its own. |

**One consequence of A-4 worth knowing:** to make the app work out of the box, the very first mesocycle is created automatically on first launch, dated to the Monday of that week. Every one after that is your call.

---

## 2. Things in the brief I want to push back on

You asked for this. Nothing here blocks Phase 1 — most of it lands in Phase 3 or later — but I'd rather you see it now.

### 2.1 "Written synchronously on every set" is not literally possible — here's what I'll actually do

IndexedDB has no synchronous write API in a browser. There is no version of this app where the write finishes inside the tap handler. What I will do instead, which meets the actual requirement:

- The write starts the instant you tap **Log set**, before any animation or navigation.
- The set row only renders as logged once the database transaction has committed. No optimistic UI, no "saving…" limbo.
- Nothing is ever held in React state waiting for session end.

The failure window is roughly a few milliseconds of transaction time. To lose a set you'd have to kill the tab inside that window. Phase 2's gate will demonstrate this with the tab actually killed mid-session.

### 2.2 iOS can delete your data, and this is the biggest real risk to "never loses data"

Safari evicts IndexedDB for sites that go unused for about seven days. Installing to the home screen makes eviction much less likely but does not formally guarantee anything. Since you train six days a week you're realistically fine, but "no cloud sync" plus "browser storage" genuinely means one hardware loss equals total data loss. Three mitigations, all in Phase 7:

1. Call `navigator.storage.persist()` on launch, which asks iOS to exempt us from eviction — usually granted for installed PWAs.
2. JSON export (already in your Settings spec).
3. A home-screen nudge if you haven't exported in 30 days.

If you ever want this genuinely safe, the answer is a sync layer, and the data model in §4 is built so one can be added without a rewrite.

### 2.3 The soreness prompts will be slower than five seconds as specified

The brief says one soreness prompt "before the first exercise of a muscle group". Taken literally, and tagging each exercise with the muscle it actually trains, that's:

- Day A → chest, triceps = **2 prompts**
- Day B → quads, hamstrings, calves = **3 prompts**
- Day C → back, rear delts, biceps, side delts = **4 prompts**

Four full-screen questions before you touch a weight, six days a week, is exactly the thing you said would get skipped. **My recommendation:** ask only for the day's headline muscle groups — 2 on Day A, 2 on Day B (quads, hamstrings), 3 on Day C (back, biceps, shoulders) — and let the smaller muscles inherit their group's answer. That's the same information at half the taps.

I've built the data model to support either, and made the prompt list a per-day setting. **This does not need deciding until Phase 4** — I'll come back to you then with the real screens in front of you, which is a better moment to judge it.

### 2.4 RIR 3+ and RIR 2 doing the same thing will under-progress you

Your table gives +1 increment for both "3+ reps left" and "2 reps left". RP's own logic escalates: lots left in the tank means you were meaningfully under-loaded and should jump harder. As written, an exercise you're badly under-loading on climbs at 5 lb per session, same as one you're nearly maxing.

I'm **building it exactly as you specified** — it's your program. But the engine is pure functions with the table in one place, so changing 3+ to +2 increments later is a one-line change plus a test. Flagging it so it's a decision, not an accident.

### 2.5 Small gaps I filled in, so you can object

| Gap | What the brief says | What I chose |
|---|---|---|
| "Beat last session's reps" — on which set? | Unspecified | The **top set** = highest weight lifted; ties broken by most reps. |
| Starting set count for a brand-new exercise | Unspecified | **3 sets** (middle of your 2–5 clamp). |
| Starting weight for a brand-new exercise | Unspecified | No guess. First time only, you type it once; every session after is prescribed. |
| What "streak" means | "small streak / consistency indicator" | Consecutive **scheduled** training days completed. Sundays don't break it. An explicit skip does. |
| Does deload reset the "no two increases in a row" guard? | Unspecified | Yes. A deload isn't an increase, so week 1 of a new block can add load. |
| Does "still sore" also drop load? | "hold load, drop a set" | Hold, not drop — unless the rep floor was missed, per A-2. |
| Units | "5 lb" | Pounds only. No kg toggle. Say the word if you want one. |

### 2.6 One thing I'm doing differently from the brief, and why

The brief lists Recharts for charts. I agree, and I'm **not installing it until Phase 6**. Same for the fonts: they'll be installed as npm packages and served from your own app rather than loaded from Google Fonts, because a font hosted on a CDN is a blank screen in airplane mode. Everything else in Part 3 I'm taking as-is.

---

## 3. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 8 + React 19 + TypeScript (strict) | As specified. `strict: true`, and `any` is banned by CLAUDE.md. |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | Current version, no PostCSS config needed. See §5 for how it stays token-driven. |
| Storage | Dexie 4 + `dexie-react-hooks` | As specified. `useLiveQuery` gives components auto-updating reads with no state library. |
| State | React local state + Dexie live queries | As specified. No Redux, no Zustand, no React Query. |
| Routing | ~40 lines of hand-rolled hash routing | Six screens. `react-router` is 20 kB to solve a problem this app doesn't have. Hash routing also survives being loaded from a home-screen icon offline. |
| Tests | Vitest + `fake-indexeddb` | Vitest as specified. `fake-indexeddb` lets database code be tested in Node without a browser. |
| Fonts | `@fontsource-variable/space-grotesk` (numbers), `@fontsource-variable/inter` (text) | Self-hosted so they work offline. Space Grotesk is the "characterful" face with tabular figures; Inter is the legible one. |
| Screenshots | `@playwright/test` (dev only) | So the 390×844 screenshot gate is a repeatable script, not me eyeballing it. |
| Charts | Recharts — **Phase 6 only** | Not installed before then. |
| Backend | None | As specified. |

**Every dependency above is justified in one line, per your rule. Nothing else gets installed without asking.**

---

## 4. Data model

Nine Dexie tables. All in `src/db/`.

```
muscleGroups       Chest, Triceps, Quads … referenced by id, never by name
exercises          the library — editable, this is not a hardcoded structure
dayTemplates       Day A / B / C: which exercises, in what order, on which weekdays
mesocycles         a 6-week block; you start these manually
sessions           one per training day: in_progress | completed | skipped
sets               one row per logged set — the thing that must never be lost
exerciseFeedback   pump / RIR / joint pain, one per exercise per session
sorenessFeedback   one per muscle group per session
prescriptions      what the engine told you to do, including the sentence it said
appSettings        singleton: active mesocycle, last cardio settings
```

### Key fields

**`muscleGroups`** — `id`, `name`, `inheritsFromId: string | null`, `updatedAt`. Its own table rather than a name repeated across three others, so renaming "Quads" in Settings cannot silently detach an exercise from its soreness prompt or orphan historical feedback. `inheritsFromId` is where §2.3 lives: a group not prompted for directly borrows another's answer, which keeps the prompt list short without leaving any exercise unanswered. Seeded so calves ride along with quads.

**`exercises`** — `id`, `name`, `type: 'compound' | 'isolation'`, `muscleGroupId`, `repTargetMin`, `repTargetMax`, `weightIncrementLb` (default 5, editable per exercise as you asked), `restSeconds` (150 compound / 120 isolation, editable), `isArchived`, `updatedAt`

**`dayTemplates`** — `id`, `letter: 'A' | 'B' | 'C'`, `name`, `weekdays: number[]`, `exerciseIds: string[]` (ordered — this is what makes exercises swappable), `sorenessPromptGroupIds: string[]`

**`sessions`** — `id`, `date` (`YYYY-MM-DD`), `dayTemplateId`, `mesocycleId`, `weekNumber`, `isDeload`, `status`, `currentExerciseIndex` (**this is what makes a killed session resume in the right place**), `cardio`, `startedAt`, `completedAt`

**`sets`** — `id`, `sessionId`, `exerciseId`, `setIndex`, `weightLb`, `reps`, `prescribedWeightLb`, `prescribedReps`, `loggedAt`

**`prescriptions`** — `id`, `mesocycleId`, `sessionId`, `exerciseId`, `weekNumber`, `plannedSets`, `plannedWeightLb`, `repTargetMin/Max`, `minRepsToBeat`, `targetRir`, `loadAction: 'increase' | 'hold' | 'decrease'`, `sentence`

Two things earn their keep here: `loadAction` is how "never increase two sessions in a row" is enforced without recomputing history, and `sentence` is the stored plain-English explanation you asked the engine to always be able to give.

### Built so a sync layer can be added later

You said no cloud sync now, but leave the door open. Three properties do that, and they cost nothing today:

1. **Every primary key is a UUID string**, not an auto-incrementing number. Two devices can create records offline without colliding.
2. **Every row carries `updatedAt`**, so a future sync can resolve conflicts by timestamp.
3. **Rows reference each other by UUID only** — no positional or numeric coupling — so a table can sync independently of the others.

That's the whole difference between "add sync later" and "rewrite later".

---

## 5. Design tokens — how the "never hardcode a colour" rule is enforced

`src/styles/tokens.ts` is the single source of truth. It exports a plain typed object: colours, spacing, radii, glow shadows, type scale, durations.

Tailwind v4 configures its theme in CSS, not JavaScript, so the two could drift. Rather than maintain both by hand, a **~40-line Vite plugin generates the CSS variables from `tokens.ts`** and regenerates on every dev start, every build, and whenever `tokens.ts` is edited. Change a colour in one file and both Tailwind utilities and any TypeScript that needs the raw value update together. There is no second place to edit.

Starting palette, from Part 7:

| Token | Value | Use |
|---|---|---|
| `bg` | `#0A0A0B` | page |
| `surface` | `#121214` | cards |
| `surfaceRaised` | `#1A1A1D` | set rows, steppers |
| `border` | `#232327` | hairlines |
| `accent` | `#EEF3FF` | the only accent |
| `textSecondary` | `#8A8A93` | labels |
| `textMuted` | `#56565E` | **last session's greyed-out numbers** |
| `alert` | `#C25A50` | muted red — "still sore" and joint pain **only** |

Plus `glow.soft` / `glow.strong` as accent-coloured box-shadows. Part 7 says at most two glowing things per screen; I'll treat that as a rule to check at every screenshot review, not a suggestion.

---

## 6. The engine

`src/engine/` — pure functions. No React import, no Dexie import, no `Date.now()`. History in, recommendation out. This is the part you'll want to tweak, so it's the part with no dependencies.

```ts
recommend(input: ExerciseHistoryInput): Recommendation
```

`Recommendation` = `{ sets, weightLb, repTargetMin, repTargetMax, minRepsToBeat, targetRir, loadAction, sentence, reasons[] }`.

### Sets

Straight from your matrix, then clamped to 2–5:

| | pump: low | moderate | great |
|---|---|---|---|
| **none** | +2 | +1 | +1 |
| **a little** | +1 | 0 | 0 |
| **still sore** | −1 | −1 | −1 |

### Load — resolved as a delta, so the rules can't contradict each other

The brief's load rules can fire at once, so they're applied in a fixed order rather than as independent if-statements:

```
1. delta = +1 if RIR is 3+ or 2, else 0
2. if top-set reps < rep floor    → delta = −1      (A-2: hard override, beats everything)
3. if delta > 0 and (still sore OR joint pain OR last session was an increase) → delta = 0
4. weight = lastWeight + delta × increment
```

Which yields, correctly and without special cases: still-sore holds load and drops a set; joint pain holds; two increases in a row is impossible; missing the rep floor always drops you back one; RIR 1 holds and chases reps; RIR 0 repeats.

### Deload (week 6)

Short-circuits everything above: `sets = max(2, floor(lastSets / 2))`, `weight = roundToIncrement(lastWeight × 0.9)` per A-3, `targetRir = 4`, no feedback prompts, no progression recorded. Pre-deload set counts are preserved so the next block starts from them, at the last working weight.

### The sentence

Every recommendation returns one plain sentence and it's stored on the row — *"Add a set today — you weren't sore and the pump was low"*, *"Same weight, beat 9 reps."*, *"Holding load — you added weight last session."* If the engine can't explain a recommendation in a sentence, that's a bug in the engine.

---

## 7. File structure

```
BRIEF.md  CLAUDE.md  PLAN.md
scripts/
  print-program.ts          Phase 1 gate — prints the seeded program
  screenshot.ts             Playwright, 390×844
  generate-tokens-css.ts    tokens.ts → CSS vars
src/
  main.tsx  App.tsx
  styles/     tokens.ts ← single source of truth · index.css
  db/         db.ts · schema.ts · seed.ts · queries.ts · mutations.ts
  engine/     recommend.ts · sets.ts · load.ts · deload.ts · sentence.ts · types.ts
  features/
    home/  session/  feedback/  cardio/  history/  settings/
  components/ Button · Card · Stepper · GlowRing · Screen
  lib/        schedule.ts · date.ts · router.ts
```

Components never import Dexie; they call `src/db/queries.ts` and `src/db/mutations.ts`. The engine imports nothing from either.

---

## 8. Build order

One phase per session. No building ahead. Every phase ends with: tests run and output shown, production build passing, a 390×844 screenshot critiqued against Part 7, a subagent review against this plan, and a commit.

| Phase | Scope | Gate |
|---|---|---|
| **1** | Scaffold, tokens, Dexie schema, seed Part 4, home screen renders today from the database | Builds, runs, home-screen screenshot, `npm run print-program` output |
| **2** | Session screen, set rows, steppers, rest timer, write-per-set, completion, cardio | Tab killed mid-session, reopened, sets intact — demonstrated |
| **3** | The engine, tests first | Full passing test output: every matrix cell, every RIR case, the increase guard, below-floor, joint pain, clamps |
| **4** | Feedback prompts, greyed last-session numbers, recommendation sentence | Feedback flow screenshots + two fake sessions showing the recommendation change |
| **5** | Mesocycle, week counter, deload, reset | Test simulating six weeks, asserting deload and reset |
| **6** | Three charts. Nothing more. | Screenshots with realistic seeded data |
| **7** | Manifest, icons, service worker, offline, JSON export/import | Works in airplane mode from the home-screen icon + install instructions |
| **8** | Critique every screen against Part 7 and fix | Before/after screenshots |

### Phase 1 in detail

1. Vite + React + TS scaffold, strict mode, Vitest wired up
2. Tailwind v4 + the tokens pipeline from §5
3. Self-hosted fonts, tabular figures verified on screen
4. Dexie schema — all seven tables from §4
5. Seed: 15 exercises, 3 day templates, weekday mapping, mesocycle 1, settings. Idempotent — re-running never duplicates.
6. `src/lib/schedule.ts` — today's weekday → day template; mesocycle week number
7. Home screen: day letter, muscle groups, exercise cards, "Week _ of 6", Start session, Sunday rest state, streak indicator
8. `scripts/print-program.ts` — reads the seeded database in Node and prints it
9. Tests: seed idempotency, weekday mapping, week-number maths
10. Screenshot, self-critique against Part 7, subagent review, build, commit

**Phase 1 explicitly does not include:** logging anything, the engine, feedback, charts, the service worker. Start session will not be wired up yet.

---

## 9. Phase status

| Phase | Status |
|---|---|
| Plan | ✅ Approved |
| 1 — Skeleton and data layer | ✅ Complete — 67 tests passing, build passing, reviewed, verified on four phone sizes |
| 2 — Logging | ✅ Complete — 88 tests passing, kill-and-resume proven in a real browser, deployed |
| 3 — Engine | ✅ Complete — 41 spec-derived tests, all rules covered |
| 4 — Engine wired in | ✅ Complete — prompts, prescriptions, sentences live; walkthrough + browser proof passing |
| 5 — Mesocycle and deload | ⬜ Not started |
| 6 — History | ⬜ Not started |
| 7 — PWA and backup | ⬜ Not started |
| 8 — Polish | ⬜ Not started |

### Modified files

**Planning:** `BRIEF.md`, `CLAUDE.md`, `PLAN.md`

**Phase 1:**
```
index.html · package.json · tsconfig.json · tsconfig.app.json
tsconfig.node.json · vite.config.ts · .gitignore

scripts/generate-tokens-css.ts   tokens.ts → Tailwind theme, as a Vite plugin
scripts/print-program.ts         Phase 1 gate — prints the seeded program
scripts/screenshot.ts            390×844 capture + Part 7 quality-floor audit

src/main.tsx · src/App.tsx
src/styles/tokens.ts             single source of truth for every visual value
src/styles/index.css             base layer, self-hosted fonts, reduced motion
src/styles/tokens.generated.css  generated — do not edit
src/db/schema.ts · db.ts · seed.ts · queries.ts
src/db/program.fixture.ts       BRIEF Part 4 transcribed by hand, for the tests
src/lib/date.ts · schedule.ts · ids.ts · useToday.ts
src/components/Screen.tsx · Card.tsx · Button.tsx
src/features/home/HomeScreen.tsx
src/test/setup.ts
src/lib/date.test.ts · src/lib/schedule.test.ts · src/db/seed.test.ts

screenshots/home-training-day.png · home-rest-day.png
```

**Phase 2:**
```
src/db/mutations.ts              every write: start/resume, saveSet, position,
                                 complete, skip/undo — commit-before-render
src/db/queries.ts                + getPreviousExerciseSets, getSessionView
src/db/seed.ts                   + Sunday anchoring fix + untrained re-anchor
src/lib/date.ts                  + upcomingTrainingWeekStart
src/lib/router.ts                hash routing, ~30 lines
src/components/Stepper.tsx       steppers first, tap-to-type second
src/features/session/SessionScreen.tsx · RestTimer.tsx
src/features/home/HomeScreen.tsx wired: Start / Resume / Skip / Done states
src/App.tsx                      routes / and /session
scripts/prove-resume.ts          the Phase 2 gate, in a real browser
src/db/mutations.test.ts
screenshots/resume-*.png · session-*.png
```

### Phase 2 notes

- **The gate:** `npm run prove-resume` drives the production build in Chromium
  at iPhone size: starts a session, logs sets across two exercises, kills the
  page with no warning, opens a fresh one, and asserts from the rendered DOM
  that it resumed on the right exercise with every set intact — then drives
  the rest of the session through the timer and cardio to completion.
- **Write contract:** a set is committed inside a Dexie transaction before
  `saveSet` resolves; the UI renders logged sets only from a live query.
  There is no optimistic set state anywhere.
- Two defects found by the browser proof before any human saw them: the rest
  timer rendered *behind* the action bar (untappable Dismiss), and the seed
  anchored a Sunday install's mesocycle to the Monday six days past, reading
  "Week 2 of 6" the day after install. Both fixed; the second also repairs
  already-affected databases on next launch, as long as nothing has been
  trained yet.
- Deliberate scope note: a session left in progress at midnight stays attached
  to its own date — the new day simply starts fresh. Nothing is lost; the
  half-done session is just never counted as completed.

**Phases 3 + 4 (built together at the product owner's request):**
```
src/engine/types.ts · sets.ts · load.ts · deload.ts · sentence.ts · recommend.ts
src/engine/recommend.test.ts     41 tests, written from the brief first
src/db/schema.ts                 feedback vocabulary now imported from the engine
src/db/mutations.ts              + saveSorenessFeedback, saveExerciseFeedback,
                                 generatePrescriptions (engine adapter)
src/db/queries.ts                + prescriptions/feedback/prompts in SessionView;
                                 restructured into Promise.all batches (see notes)
src/db/prescriptions.test.ts     the full loop: session 1 feedback → session 2 numbers
src/features/session/QuestionScreen.tsx · FeedbackFlow.tsx
src/features/session/SessionScreen.tsx   check-in flow, recommendation banner,
                                 feedback triggers, prescription-aware logging
scripts/walkthrough.ts           Phase 4 gate: two consecutive sessions, asserted
scripts/prove-resume.ts          extended through check-in + feedback + resume
screenshots/feedback-*.png · session-recommendation.png
```

### Phase 3+4 notes

- **Phase 3 gate:** 41 engine tests written from BRIEF Part 5 before the
  implementation — all nine matrix cells, all four RIR cases, the
  consecutive-increase guard (including a five-session chain), the
  below-floor override beating RIR/joint-pain/still-sore, both clamps, the
  deload rounding tie, first-time, skipped feedback, purity. Tests-first
  caught one real divergence: a blocked consecutive increase must chase reps,
  not just hold.
- **Phase 4 gate:** `npm run walkthrough` simulates two consecutive Day A
  sessions and asserts every prescription changes exactly as the rules say —
  five exercises covering increase, double-increment-worthy, chase-reps,
  repeat, and joint-pain-hold, each with its sentence. `npm run prove-resume`
  drives the real UI through check-in → recommendation → logging → feedback →
  kill → resume → auto-feedback on the last planned set → cardio → completion.
- **A serious bug found by the browser gate, invisible to every unit test:**
  Dexie's live-query dependency tracking silently died partway through the
  session view's long chain of sequential awaits, so the UI never refreshed
  after a soreness answer — the check-in froze on its first question, with the
  data correctly written underneath. Diagnosed by bisection down to which
  table writes woke the view; fixed by restructuring `assembleSessionView` so
  every table read starts synchronously inside Promise.all batches, and
  verified by a reactivity probe across all five tables. The shape of that
  function is now load-bearing and commented as such.
- The §2.3 prompt-count decision is now live as recommended: 2 check-in
  questions on Days A and B, 3 on Day C, with calves inheriting the quads
  answer. Standing offer: say the word to switch any day to the full per-muscle
  list — it is data, not code.

### Phase 3+4 review, and what it changed

The independent review recomputed the whole engine against the brief —
matrix cell by cell, RIR row by row, deload rounding brute-forced across
increments up to 1000 lb — and confirmed it exact, tests genuine, purity
clean, and the live-query fix holding. It found one bug worth fixing and
three things now recorded as deliberate:

1. **Fixed:** if the app died between the last check-in answer and the plan
   being stored, the exercise screen could show last session's weight in the
   stepper directly under a sentence saying "add 5 lb" — reproduced in a real
   browser on exactly the recovery path built for that window. The stepper now
   re-seeds when the prescription arrives, unless sets are already logged or
   the user has touched it (their number always wins).
2. **Fixed (cosmetic honesty):** at the one-increment weight floor, a
   below-floor drop used to report "decrease · drop to 5 lb" while prescribing
   the same 5 lb. The action now derives from what actually happened to the
   weight.
3. **Accepted:** an exercise added to a day mid-session gets no prescription
   for that session (it degrades to plain logging; next session treats it
   properly). Editing templates lands with Settings in Phase 7 — revisit then.
4. **Accepted:** soreness inheritance resolves one level (calves → quads),
   which covers all seeded data; chains only become possible once groups are
   user-editable.

### Phase 2 review, and what it changed

The independent review confirmed the write-on-log contract, the two-tap
logging, double-tap safety, timer behaviour, resume correctness and test
genuineness — and found four things worth fixing, all fixed the same session:

1. **A data-loss path through skipped sessions.** A stale tab on the session
   screen could log sets into a session that had since been skipped, and
   "Undo skip" would then delete the session and orphan the work invisibly.
   Three fixes: `saveSet` now refuses any session that is not in progress,
   `undoSkip` refuses to delete a session holding sets regardless of how they
   got there, and the session screen now follows only the *active* session so
   skipped and completed sessions are unreachable from it entirely.
2. **Midnight mid-workout ejected the user and stranded the session.** The
   session screen was keyed to today's date, so at 00:00 it navigated home
   and the half-done workout became permanently unreachable — never
   completed, never a greyed target, never in the streak. The screen now
   follows the in-progress session wherever its date lies, and the home
   screen offers "Finish previous session" (on rest days too) until a new
   session is deliberately started.
3. **The tap-to-type fallback silently rewrote typed weights.** Typing 187
   with a 5 lb increment recorded 185. Typed values are now stored exactly as
   typed — the keyboard exists precisely for weights the stepper grid can't
   reach — and the +/− buttons step from whatever was typed.
4. **Clearing a stepper field committed 0.** An emptied field is now a
   cancelled edit, like garbage input already was.

Also tidied from the review: the home screen's "45 min incline walk" copy now
reads the real last-cardio duration, and the cardio fallback constants come
from the seed's `DEFAULT_CARDIO` rather than a duplicate literal. Accepted
as-is: a deliberate second tap landing in the milliseconds before the live
query refreshes re-saves the same set instead of logging the next one — the
overwrite semantics absorb it harmlessly — and `getPreviousExerciseSets`
scans completed sessions linearly, fine at gym scale, worth an index before
History ships.

### Phase 1 notes

Three defects were found and fixed during the phase, all by the tests or the
screenshot audit rather than by reading the code:

1. `fromIsoDate` returned an Invalid Date for malformed input instead of
   throwing, because `Number('not')` is `NaN` rather than `undefined`. `NaN`
   dates would have spread silently through every downstream calculation. Now
   validated by pattern and by round-trip, so `2026-02-30` is rejected rather
   than rolling forward into March.
2. The primary action was rendering below the fold. A flex child with
   `overflow-y-auto` and no `min-h-0` grows to fit its content instead of
   scrolling, so the shell exceeded the viewport. `Screen` now pins to `h-dvh`
   with `min-h-0` on the scroll region, and `scripts/screenshot.ts` asserts the
   action is on-screen and in the bottom third so it cannot regress unseen.
3. Exercise names were truncating mid-word ("Incline hammer strength…"). Names
   now wrap.

Two deliberate deviations from the original plan, both minor: touch sizes are
emitted into Tailwind's `spacing` namespace rather than a `size` one, because
v4 has no size namespace for `min-h-*`; and `scripts/screenshot.ts` falls back
to a pre-installed Chromium when the CI image ships a different revision to the
one Playwright bundles.

### Phase 1 review, and what it changed

An independent review against this plan found six things worth fixing. All are
now fixed, and the fixes are what the second and third Phase 1 commits contain.

1. **The streak was wrong when you skipped today.** `currentStreak` gave an
   unlogged today a grace period so a streak wouldn't read zero before you'd
   trained. But it couldn't tell "haven't trained yet" from "tapped Skip", so
   skipping Wednesday after training Monday and Tuesday still showed 2. It now
   returns 0. The old test only covered a skip in the *past*, which is why the
   suite was green while the behaviour was wrong.
2. **The seed tests were tautological.** They compared the database against the
   same constants the seed writes from, so they proved the plumbing worked but
   not that it matched the brief — a deleted exercise, a flipped
   compound/isolation flag or a wrong rep target would all have passed.
   `src/db/program.fixture.ts` now transcribes Part 4 by hand, and every seeded
   row is asserted against it. Verified by deliberately breaking the seed five
   ways and confirming each one fails.
3. **Muscle groups were joined by display name across three tables**, which
   quietly contradicted the sync-readiness property this section claims.
   Renaming a group would have detached exercises from their prompts. Now a
   real table with UUID keys — done in Phase 1 because there is no data to
   migrate yet, and it would have forced a schema change in Phase 4.
4. **`Standing calf raise` had no soreness prompt covering it** — Day B prompts
   quads and hamstrings, and nothing expressed §2.3's "smaller muscles inherit".
   `inheritsFromId` now does, and a test fails if any exercise is left
   uncovered.
5. **Two smaller correctness issues**: `seedIfEmpty` reported a write it hadn't
   made when the two-tab race guard fired, and the `newId` fallback called
   `crypto` inside a branch that only ran when `crypto` was undefined.
6. **The date never advanced at midnight.** A phone left on the home screen
   overnight showed the previous day's session until reloaded — cosmetic now,
   a data-correctness problem from Phase 2 where a session is keyed on it.
   `useToday` now re-checks at midnight and whenever the tab becomes visible.

### Mobile verification

Prompted by "make sure it's mobile friendly", the screenshot script became a
device sweep, and it immediately found a bug that a desktop browser cannot see.

**The bug:** safe-area padding was applied to `body`, while the screen shell
was a full viewport height. On a notched iPhone that is 100dvh *plus* about
80px, so the whole page scrolled and "Start session" sat below the fold —
exactly the defect fixed earlier in the phase, reappearing on the real device
only. Insets are now absorbed by the layout rather than added to the document.

Every screen is now checked on four phones — iPhone SE (375×667), 13 mini
(375×812), 14 (390×844), 15 Pro Max (430×932) — with their real safe-area
insets simulated, asserting: no page scroll, no horizontal overflow, the
primary action on-screen and in the bottom third, nothing under the notch or
home indicator, no touch target under 44px, and tabular figures.

The check was itself verified by removing the fix and confirming it fails. Note
what that control showed: with the fix removed, the **iPhone 14 still passed**
while the 13 mini and 15 Pro Max failed, because 48px of padding happens to
clear a 47px notch. Testing one device size would have missed this.

Also hardened for phone use: the scroll region contains its own overscroll, so
a rubber-band at the top of the exercise list can't trigger a pull-to-refresh
and reload the app mid-workout.
