# Workout Tracker — Claude Code Project Brief

Personal hypertrophy training app. RP-style autoregulation, local-first PWA, single user.

---

## PART 0 — How to run this (read this bit yourself, don't paste it)

1. Make a folder: `mkdir ~/lift && cd ~/lift`
2. Put this file in it as `BRIEF.md`
3. Run `claude`
4. Press `Shift+Tab` until you see **plan mode on**
5. Paste the message in Part 1 below.
6. Read the plan it gives you. Push back on anything that sounds wrong. Then approve it.
7. After each phase: test it on your phone, then `/clear` before starting the next phase.

**Rules of thumb while you work:**
- One phase per session. Long sessions get worse, not better.
- If you've corrected it twice on the same thing, `/clear` and re-explain from scratch instead of arguing.
- `Esc` stops it mid-action. `/rewind` undoes code and conversation.
- Ask it questions freely — "why did you do it that way?" is a legitimate prompt.
- Never let it move to the next phase until you've physically used the current one in the gym.

---

## PART 1 — The message to paste into Claude Code

> Read @BRIEF.md in full before doing anything.
>
> You are the lead engineer on this. I am the product owner and I don't write code — so you own all technical decisions, but you explain them to me in plain English and you never leave me with something broken.
>
> First, in plan mode: read the brief, then write a plan to `PLAN.md` covering the stack, file structure, data model, and the phase-by-phase build order. Flag anything in the brief that's ambiguous, contradictory, or a bad idea — I'd rather fix it now. If you need decisions from me, use the AskUserQuestion tool rather than guessing.
>
> Then create `CLAUDE.md` using the content in the brief's Appendix A.
>
> Once I approve the plan, build **Phase 1 only** and stop. Do not build ahead. At the end of every phase you must: run the tests, show me the actual output, take a screenshot of the result at 390x844 (iPhone size), and commit with a descriptive message.

---

## PART 2 — Product spec

### What it is
A workout logger I use six days a week at LA Fitness, on my phone, standing between sets. It tells me what to lift today based on how last session went. It is not a social app, not a coaching app, and it has no accounts.

### Non-negotiables
- **Works offline.** Gym wifi is bad. Every interaction must work with the phone in airplane mode.
- **Thumb-usable.** Logging one set is at most two taps. No typing where a stepper will do.
- **Never loses data.** A dropped connection, a locked screen, or a closed tab must not lose a logged set.
- **Fast.** Cold open to logging the first set in under three seconds.

### Explicitly out of scope for now
No exercise instruction videos. No accounts or login. No cloud sync. No sharing. No nutrition. No Whoop / Eight Sleep / Google Calendar integration — those come in a later project, but leave the data layer clean enough that a sync layer could be added later without a rewrite.

---

## PART 3 — Technical direction

Use this unless you have a strong, stated reason not to. If you disagree, say so in `PLAN.md` before building.

| Concern | Choice |
|---|---|
| App type | Installable PWA (add to home screen), not a native app |
| Framework | Vite + React + TypeScript |
| Styling | Tailwind |
| Storage | IndexedDB via Dexie, written synchronously on every set |
| State | Local React state + Dexie live queries. No Redux. |
| Tests | Vitest for the progression engine |
| Charts | Recharts, only in the history phase |
| Backend | None |

**Architecture requirement:** the progression logic lives in `src/engine/` as pure functions with no React and no database imports. It takes a history object in, returns a recommendation out. This is the part that must be unit tested and the part I'll want to tweak most often.

**Data safety requirement:** an in-progress session is persisted to IndexedDB after every single set, not on session finish. If the app is killed mid-workout, reopening it resumes exactly where I was.

---

## PART 4 — My training program

Six days a week, Sunday off. Three-day rotation run twice. Every session ends with 45 minutes of incline treadmill walking.

**Day A — Chest & Triceps (Mon, Thu)**
| Exercise | Type | Rep target |
|---|---|---|
| Incline hammer strength press | compound | 8–12 |
| Flat or low-incline machine press | compound | 8–12 |
| Pec deck fly | isolation | 10–15 |
| Straight bar cable pushdown | isolation | 10–15 |
| Overhead tricep extension machine | isolation | 10–15 |

**Day B — Legs (Tue, Fri)**
| Exercise | Type | Rep target |
|---|---|---|
| Leg press | compound | 8–12 |
| Quad extension | isolation | 10–15 |
| Romanian deadlift | compound | 8–12 |
| Standing calf raise | isolation | 12–20 |

**Day C — Back, Biceps & Shoulders (Wed, Sat)**
| Exercise | Type | Rep target |
|---|---|---|
| Wide-grip lat pulldown | compound | 8–12 |
| Seated cable row | compound | 8–12 |
| Cable rear delt fly | isolation | 12–20 |
| Machine preacher curl | isolation | 10–15 |
| Incline dumbbell curl | isolation | 10–15 |
| Cable lateral raise | isolation | 12–20 |

**Rest timers:** compound = 150s, isolation = 120s. Starts automatically when a set is logged. Configurable per exercise.

**Equipment note:** everything is machines and cables except the RDL and incline curl. Default weight increment is 5 lb; make it editable per exercise since some stacks jump by 10 or 15.

**Exercises must be editable.** I add, remove, and swap movements. The seeded list above is a starting point, not a hardcoded structure.

---

## PART 5 — The progression engine (the important part)

This replicates what I like about the RP Hypertrophy app: the app asks how my body responded and adjusts sets and load accordingly.

### Prompts

**Before the first exercise of a muscle group** — "How sore is your [chest] from last time?"
`none` · `a little` · `still sore`

**After the last set of each exercise** — two questions:
- "How was the pump?" → `low` · `moderate` · `great`
- "Reps left in the tank on that last set?" → `3+` · `2` · `1` · `0`

Optionally a third, dismissible: "Any joint pain?" → `no` · `yes`. If yes, flag the exercise and don't add load next session.

### Set progression

Applied to next session's set count for that exercise:

| | pump: low | pump: moderate | pump: great |
|---|---|---|---|
| **soreness: none** | +2 sets | +1 set | +1 set |
| **soreness: a little** | +1 set | no change | no change |
| **soreness: still sore** | −1 set | −1 set | −1 set |

Clamps: minimum 2 sets, maximum 5 sets per exercise.

### Load progression

Based on reps-left-in-tank on the final set:

| RIR reported | Next session |
|---|---|
| 3+ | +1 increment, keep rep target |
| 2 | +1 increment, keep rep target |
| 1 | same weight, beat last session's reps |
| 0 | same weight, same reps |

Additional rules:
- **Never increase load two sessions in a row on the same exercise.** If last session was an increase, this session holds and chases reps instead.
- If reps on the top set fell **below** the rep target's floor, drop back one increment.
- If joint pain was flagged, hold load regardless.
- Soreness `still sore` overrides everything: hold load, drop a set.

### Mesocycle and deload

Five weeks of accumulation, then week six is a deload. On deload week:
- Sets = half of last week's, rounded down, minimum 2
- Load = −10%
- Target RIR = 4, i.e. stop well short
- No feedback prompts, no progression applied

After the deload, week one of the new mesocycle starts from the deload week's *pre-deload* set counts, at the last working weight.

The app shows me where I am: "Week 3 of 6" somewhere on the home screen.

### What I see when logging

For each set row: **last session's weight × reps, greyed out, as the target to beat**, and today's inputs next to it. Plus a one-line recommendation at the top of the exercise, in plain words — e.g. *"Add a set today — you weren't sore and the pump was low"* or *"Same weight, beat 9 reps."*

The engine must always be able to explain itself in one sentence. Store that sentence with the recommendation.

---

## PART 6 — Screens

**Home / Today.** Today's day letter and muscle groups, the exercise list as cards, mesocycle week indicator, a big "Start session" control. On Sunday it shows a rest day state. Underneath: a small streak / consistency indicator.

**Session.** One exercise at a time, swipe or tap to move between them. Set rows with last session's numbers greyed behind today's inputs. Weight and reps entered with steppers, not keyboards, with a tap-to-type fallback. Rest timer appears automatically on logging a set, counts down, and is dismissible. Progress along the top: exercise 3 of 5.

**Feedback.** The soreness / pump / RIR prompts, as full-screen single-question steps with big tap targets. Fast — this is the thing most likely to get skipped, so it must take under five seconds.

**Cardio.** At the end of a session: duration, incline, speed. Pre-filled with 45 min and last session's settings, one tap to confirm.

**History.** Per exercise: weight over time, total volume over time, and the set count trend across the mesocycle. Keep it to three charts, not a dashboard.

**Settings.** Edit the exercise library, edit each day's exercise list, set weight increments, set rest times, export and import a JSON backup.

---

## PART 7 — Visual direction

Dark, minimal, quietly premium. The reference feeling is a piece of well-made hardware, not a fitness app.

- **Background:** near-black, around `#0A0A0B`, with cards a touch lighter — layered dark, not flat black.
- **Accent:** cool white with a faint blue cast, around `#EEF3FF`. This is the *only* accent. No secondary colour except a muted red used exclusively for "still sore" / joint pain flags.
- **The glow:** the signature element. Active and interactive elements carry a soft outer glow in the accent colour — the rest timer ring, the active set row, the primary action. It should look like the light is coming *from* the element. Use it on at most two things per screen. Everything else stays quiet.
- **Type:** one characterful face for numbers — weights, reps, the timer — set large and tight, tabular figures so digits don't jump as they change. A plain, highly legible face for everything else, set small and generously spaced. The numbers are the content; treat them like the content.
- **Layout:** generous negative space. Primary actions in the bottom third where my thumb is. Nothing important in the top corners.
- **Motion:** restrained. A rest timer that counts down smoothly, a logged set that settles into place. No page transitions with personality. Respect `prefers-reduced-motion`.
- **Quality floor:** legible at arm's length under gym lighting, minimum 44px touch targets, visible keyboard focus, safe-area insets respected on iPhone.

Take a screenshot at 390×844 and critique it against this section before telling me a phase is done.

---

## PART 8 — Build phases

Build one phase per session. Each has a verification gate — do not report a phase complete without showing me the evidence.

**Phase 1 — Skeleton and data layer.**
Vite + React + TS + Tailwind scaffolded. Design tokens from Part 7 defined in one place. Dexie schema for exercises, day templates, sessions, sets, feedback, and mesocycle state. Seed the program from Part 4. Home screen renders today's session from the database.
*Gate:* it builds, it runs, screenshot of the home screen, and a script that prints the seeded program.

**Phase 2 — Logging.**
Session screen, set rows, steppers, rest timer, session persistence after every set, session completion, cardio entry.
*Gate:* kill the tab mid-session, reopen, and prove the session resumes with the logged sets intact. Show me that test.

**Phase 3 — The engine.**
Pure functions in `src/engine/`. Vitest suite covering every cell of the set matrix, every RIR case, the consecutive-increase guard, the below-target-reps case, the joint pain flag, and the clamps. Not yet wired to the UI.
*Gate:* the full test output, passing. Write the tests first.

**Phase 4 — Engine wired in.**
Feedback prompts in the session flow. Last session's numbers shown greyed. Recommendation sentence at the top of each exercise.
*Gate:* screenshots of the feedback flow, plus a walkthrough of two consecutive fake sessions showing the recommendation change correctly.

**Phase 5 — Mesocycle and deload.**
Week counter, automatic deload on week six, correct reset into week one.
*Gate:* a test that simulates six weeks and asserts the deload and reset behaviour.

**Phase 6 — History.**
The three charts. Nothing more.
*Gate:* screenshots with realistic seeded data.

**Phase 7 — PWA and backup.**
Manifest, icons, service worker, full offline capability, JSON export and import.
*Gate:* prove it works in airplane mode from the home screen icon. Then show me how to install it on my phone.

**Phase 8 — Polish.**
Go back through Part 7 and critique every screen against it. Fix what doesn't match.
*Gate:* before-and-after screenshots.

---

## PART 9 — Standing instructions

- **Ask before assuming.** If the brief doesn't cover something, use AskUserQuestion. A wrong guess costs more than a question.
- **Show evidence, not assurances.** "Tests pass" is worth nothing; the test output is worth something.
- **Address root causes.** Never suppress an error, skip a failing test, or `any` your way out of a type problem.
- **Use a subagent to review each phase** against `PLAN.md` before you tell me it's done. Ask it to report only gaps that affect correctness or the stated requirements — not style opinions.
- **Commit at the end of every phase** with a descriptive message.
- **Explain in plain English.** When you finish a phase, tell me what changed, what I should test, and anything I should know — no jargon, five sentences maximum.
- **If I ask for something that will cause problems later, say so.** I want the pushback.

---

## Appendix A — CLAUDE.md

Create this file at the project root:

```markdown
# Workout tracker

Personal hypertrophy app. Single user, offline-first PWA. Full spec in @BRIEF.md.

## Commands
- `npm run dev` — dev server
- `npm run test` — Vitest
- `npm run build` — production build, must pass before any phase is called done

## Architecture
- Progression logic lives in `src/engine/` as pure functions. No React, no Dexie imports there. This is the tested core.
- All persistence goes through `src/db/`. Components never touch Dexie directly.
- Design tokens live in `src/styles/tokens.ts`. IMPORTANT: never hardcode a colour or spacing value in a component.

## Rules
- YOU MUST write a set to IndexedDB immediately on log, never batch until session end.
- YOU MUST run tests and the production build before reporting a phase complete.
- Never add a dependency without telling me why in one sentence.
- Rep and weight inputs are steppers first, keyboards second. This is used one-handed in a gym.
- When compacting, always preserve PLAN.md's phase status and the list of modified files.
```
