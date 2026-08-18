# Chapter — personal reading + recall app

Single user (me). Mobile-first PWA. No multi-user features, ever. Full spec in @SPEC.md.

## Commands
- `npm run dev` — local dev
- `npm run build` — MUST pass before any phase is called done
- `npm test` — vitest, unit tests for scheduler + streak logic
- `npm run typecheck` — tsc --noEmit

## Architecture decisions
- All spaced-repetition and streak logic lives in `src/lib/scheduler.ts` and
  `src/lib/streaks.ts` as PURE FUNCTIONS. No DB calls, no Date.now() inside them —
  pass the current date in. These are the only things with real unit tests.
- Review intervals: +1, +3, +7, +14, +30 days, each measured from the PREVIOUS
  review, not from note creation. Five correct grades puts a note 55 days out.
  See SPEC.md §4.1 — the brief contradicts itself here and this is the resolution.
- The next due date is computed from the day you ACTUALLY reviewed, never from
  the day it was due. Overdue notes must not stay overdue after the work is done.
- Grading is three-way: got it advances, partial repeats, missed resets to +1.
- Exactly ONE pending review row per note. This is what stops a missed note
  spiralling. Grading closes the open row and inserts exactly one new one.
- Night session is capped at 5, overdue first. The cap is not negotiable — it is
  what stops a backlog feeling punishing. Always tell the user what was held back.
- Books have `progressUnit: 'pages' | 'percent'`. Audiobooks use percent.
  Never assume pages exist — `totalPages` is null until Open Library or the user
  fills it, and the app must be fully usable in that state.
- Never hardcode a page count. Ever. They vary by edition.
- Theme switches on the local clock at 19:00. A manual override persists and
  expires at the next local midnight.
- Streak days run on LOCAL MIDNIGHT. Day keys are stamped at write time and
  never recomputed, so travel and DST cannot re-bucket history.
- The reading streak and the review streak are computed by two separate functions
  fed two separate tables. Review activity CANNOT break the reading streak —
  that guarantee is structural, not a rule to remember.
- A streak whose last day is yesterday is still alive. Requiring activity today
  would show a broken streak every morning before the user has read.

## Style
- TypeScript strict. No `any`.
- Serif (Literata) for note bodies only. Sans (Inter) everywhere else.
- One accent colour (amber), defined once as a CSS variable in
  `src/styles/tokens.ts`. Never hardcode it, never hardcode any colour.
- Mobile-first. Designed and checked at 390x844. 44px minimum touch targets.

## The one interaction that matters
In the night session the note body starts HIDDEN and must NOT be in the DOM at
all — not display:none, not opacity:0, NOT RENDERED. The grade bar does not mount
until the reveal has happened. Showing the note before recall turns the whole app
into rereading and destroys the point of it. `npm run prove-phase3` asserts the
body string is absent from the rendered DOM before the reveal tap.

## Workflow
- YOU MUST run `npm run build` and `npm test` before telling me a task is done.
- Show me the test output, don't just assert it passed.
- Prefer small commits at the end of each phase.
- Don't add libraries without telling me why the built-in option won't do.

## Gotchas
- iOS Safari SpeechRecognition is unreliable — needs network, cuts off at pauses,
  breaks in installed PWAs. Do not use it. Phases 1-3 rely on the iOS keyboard's
  own dictation mic in a plain textarea; real transcription is Phase 4A via
  MediaRecorder and a server route.
- Open Library page counts are wrong often enough that manual override is
  required, not optional. A low-confidence author match may contribute a cover
  but NEVER a page count.
- Open Library is unreachable from the build sandbox. Every code path that talks
  to it must be testable with an injected fetch.
- API keys are server-side only, in `api/`. Never in the client bundle.
