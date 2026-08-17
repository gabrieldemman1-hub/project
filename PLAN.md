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
| Build | Vite 7 + React 19 + TypeScript (strict) | As specified. `strict: true`, and `any` is banned by CLAUDE.md. |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | Current version, no PostCSS config needed. See §5 for how it stays token-driven. |
| Storage | Dexie 4 + `dexie-react-hooks` | As specified. `useLiveQuery` gives components auto-updating reads with no state library. |
| State | React local state + Dexie live queries | As specified. No Redux, no Zustand, no React Query. |
| Routing | ~40 lines of hand-rolled hash routing | Six screens. `react-router` is 20 kB to solve a problem this app doesn't have. Hash routing also survives being loaded from a home-screen icon offline. |
| Tests | Vitest + `fake-indexeddb` | Vitest as specified. `fake-indexeddb` lets database code be tested in Node without a browser. |
| Fonts | `@fontsource/space-grotesk` (numbers), `@fontsource/inter` (text) | Self-hosted so they work offline. Space Grotesk is the "characterful" face with tabular figures; Inter is the legible one. |
| Screenshots | `@playwright/test` (dev only) | So the 390×844 screenshot gate is a repeatable script, not me eyeballing it. |
| Charts | Recharts — **Phase 6 only** | Not installed before then. |
| Backend | None | As specified. |

**Every dependency above is justified in one line, per your rule. Nothing else gets installed without asking.**

---

## 4. Data model

Seven Dexie tables. All in `src/db/`.

```
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

**`exercises`** — `id`, `name`, `type: 'compound' | 'isolation'`, `muscleGroup`, `repTargetMin`, `repTargetMax`, `weightIncrementLb` (default 5, editable per exercise as you asked), `restSeconds` (150 compound / 120 isolation, editable), `isArchived`, `updatedAt`

**`dayTemplates`** — `id`, `letter: 'A' | 'B' | 'C'`, `name`, `weekdays: number[]`, `exerciseIds: string[]` (ordered — this is what makes exercises swappable), `sorenessPrompts: string[]` (§2.3 lives here)

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
| 1 — Skeleton and data layer | ✅ Complete — 41 tests passing, build passing, screenshots captured |
| 2 — Logging | ⬜ Not started |
| 3 — Engine | ⬜ Not started |
| 4 — Engine wired in | ⬜ Not started |
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
src/lib/date.ts · schedule.ts · ids.ts
src/components/Screen.tsx · Card.tsx · Button.tsx
src/features/home/HomeScreen.tsx
src/test/setup.ts
src/lib/date.test.ts · src/lib/schedule.test.ts · src/db/seed.test.ts

screenshots/home-training-day.png · home-rest-day.png
```

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
