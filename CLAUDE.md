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
