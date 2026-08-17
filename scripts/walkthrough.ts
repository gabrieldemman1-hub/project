/**
 * Phase 4 gate (BRIEF Part 8): a walkthrough of two consecutive fake sessions
 * showing the recommendation change correctly.
 *
 * Runs the real seed, real mutations and real engine against an in-memory
 * IndexedDB. Monday's Day A is trained with a different response profile per
 * exercise; Thursday's prescriptions must then differ per the rules, and each
 * expectation here is asserted, not just printed.
 *
 *   npm run walkthrough
 */

import 'fake-indexeddb/auto'

import { db } from '../src/db/db'
import {
  completeSession,
  generatePrescriptions,
  saveExerciseFeedback,
  saveSet,
  saveSorenessFeedback,
  startSession,
} from '../src/db/mutations'
import { seedIfEmpty } from '../src/db/seed'
import type { Pump, Rir, Soreness } from '../src/db/schema'

const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(
    ok ? `    ${GREEN}✓${RESET} ${label}` : `    ${RED}✗${RESET} ${label}${detail ? ` — ${detail}` : ''}`,
  )
  if (!ok) failures += 1
}

/** Monday's plan per exercise: what to lift and how the body responded. */
interface Scenario {
  weightLb: number
  reps: number
  pump: Pump
  rir: Rir
  jointPain: boolean | null
  /** What Thursday must therefore prescribe. */
  expect: { weightLb: number; sets: number; action: string; sentenceHas: RegExp }
}

// One exercise per interesting rule. Soreness on Thursday is "none" for both
// chest and triceps, so the matrix row is `none`.
const SCENARIOS: Scenario[] = [
  {
    // RIR 2 earns an increment; none × great adds a set.
    weightLb: 185, reps: 10, pump: 'great', rir: '2', jointPain: null,
    expect: { weightLb: 190, sets: 4, action: 'increase', sentenceHas: /5 lb/ },
  },
  {
    // Plenty in the tank and a low pump: +5 lb and two more sets.
    weightLb: 150, reps: 12, pump: 'low', rir: '3+', jointPain: null,
    expect: { weightLb: 155, sets: 5, action: 'increase', sentenceHas: /5 lb/ },
  },
  {
    // One rep left: hold the weight and beat 12.
    weightLb: 90, reps: 12, pump: 'moderate', rir: '1', jointPain: null,
    expect: { weightLb: 90, sets: 4, action: 'hold', sentenceHas: /beat 12/i },
  },
  {
    // Nothing left: repeat.
    weightLb: 70, reps: 13, pump: 'great', rir: '0', jointPain: null,
    expect: { weightLb: 70, sets: 4, action: 'hold', sentenceHas: /match/i },
  },
  {
    // Earned an increase but flagged joint pain: held, with the reason named.
    weightLb: 60, reps: 14, pump: 'moderate', rir: '2', jointPain: true,
    expect: { weightLb: 60, sets: 4, action: 'hold', sentenceHas: /joint/i },
  },
]

async function main() {
  await seedIfEmpty(new Date(2026, 7, 16))

  console.log(`\n${BOLD}SESSION 1 — Monday, Day A, first time on everything${RESET}`)
  const monday = await startSession('2026-08-17')
  const template = await db.dayTemplates.get(monday.dayTemplateId)
  if (!template) throw new Error('no template')

  for (const groupId of template.sorenessPromptGroupIds) {
    await saveSorenessFeedback(monday.id, groupId, 'none' satisfies Soreness)
  }
  await generatePrescriptions(monday.id)

  const firstRx = await db.prescriptions.where('sessionId').equals(monday.id).toArray()
  check(
    'every exercise starts at 3 sets with no weight prescribed',
    firstRx.length === 5 && firstRx.every((rx) => rx.plannedSets === 3 && rx.plannedWeightLb === null),
  )

  for (const [index, exerciseId] of template.exerciseIds.entries()) {
    const scenario = SCENARIOS[index]
    if (!scenario) continue
    const exercise = await db.exercises.get(exerciseId)
    console.log(
      `  ${DIM}${exercise?.name}: 3 × ${scenario.weightLb} lb, pump ${scenario.pump}, RIR ${scenario.rir}${scenario.jointPain ? ', joint pain' : ''}${RESET}`,
    )
    for (let setIndex = 0; setIndex < 3; setIndex += 1) {
      await saveSet({
        sessionId: monday.id,
        exerciseId,
        setIndex,
        weightLb: scenario.weightLb,
        reps: scenario.reps,
      })
    }
    await saveExerciseFeedback(monday.id, exerciseId, {
      pump: scenario.pump,
      rir: scenario.rir,
      jointPain: scenario.jointPain,
    })
  }
  await completeSession(monday.id, { durationMin: 45, inclinePct: 10, speedMph: 3 })
  console.log(`  ${DIM}session completed with cardio${RESET}`)

  console.log(`\n${BOLD}SESSION 2 — Thursday, Day A again, not sore anywhere${RESET}`)
  const thursday = await startSession('2026-08-20')
  for (const groupId of template.sorenessPromptGroupIds) {
    await saveSorenessFeedback(thursday.id, groupId, 'none')
  }
  await generatePrescriptions(thursday.id)

  for (const [index, exerciseId] of template.exerciseIds.entries()) {
    const scenario = SCENARIOS[index]
    if (!scenario) continue
    const exercise = await db.exercises.get(exerciseId)
    const rx = await db.prescriptions
      .where('sessionId')
      .equals(thursday.id)
      .filter((row) => row.exerciseId === exerciseId)
      .first()
    if (!rx) throw new Error('missing prescription')

    console.log(`\n  ${BOLD}${exercise?.name}${RESET}`)
    console.log(`  ${DIM}“${rx.sentence}”${RESET}`)
    check(
      `weight ${scenario.weightLb} → ${scenario.expect.weightLb}`,
      rx.plannedWeightLb === scenario.expect.weightLb,
      `got ${rx.plannedWeightLb}`,
    )
    check(
      `sets 3 → ${scenario.expect.sets}`,
      rx.plannedSets === scenario.expect.sets,
      `got ${rx.plannedSets}`,
    )
    check(
      `load action is ${scenario.expect.action}`,
      rx.loadAction === scenario.expect.action,
      `got ${rx.loadAction}`,
    )
    check(
      'the sentence explains it',
      scenario.expect.sentenceHas.test(rx.sentence),
      `got “${rx.sentence}”`,
    )
  }

  console.log(
    failures === 0
      ? `\n${GREEN}RESULT: session 1's feedback changed session 2's prescriptions exactly as the rules say.${RESET}\n`
      : `\n${RED}RESULT: ${failures} check(s) failed.${RESET}\n`,
  )
  if (failures > 0) process.exitCode = 1
}

main()
  .then(() => db.close())
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
