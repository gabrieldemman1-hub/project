/**
 * Phase 1 gate: seeds a fresh database and prints the program it produced.
 *
 * Runs in Node against an in-memory IndexedDB, so it exercises exactly the same
 * seed and query code the app runs in the browser — this is evidence about the
 * real data layer, not a re-listing of the brief.
 *
 *   npm run print-program
 */

import 'fake-indexeddb/auto'

import { db } from '../src/db/db'
import { getDayTemplates, getExercisesByIds, getTodayView } from '../src/db/queries'
import { seedIfEmpty } from '../src/db/seed'
import { formatLongDate } from '../src/lib/date'
import { today } from '../src/lib/schedule'
import { WEEKDAY_NAMES } from '../src/lib/date'

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

function heading(text: string): void {
  console.log(`\n${BOLD}${text}${RESET}`)
}

function dim(text: string): string {
  return `${DIM}${text}${RESET}`
}

async function main(): Promise<void> {
  const seeded = await seedIfEmpty()
  console.log(
    seeded
      ? dim('Seeded a fresh in-memory database.')
      : dim('Database already seeded.'),
  )

  const templates = await getDayTemplates()

  heading('PROGRAM')
  for (const template of templates) {
    const days = template.weekdays
      .map((weekday) => WEEKDAY_NAMES[weekday]?.slice(0, 3) ?? '??')
      .join(', ')

    console.log(
      `\n  ${BOLD}Day ${template.letter} — ${template.name}${RESET} ${dim(`(${days})`)}`,
    )
    console.log(
      dim(`  soreness prompts: ${template.sorenessPrompts.join(', ') || 'none'}`),
    )

    const exercises = await getExercisesByIds(template.exerciseIds)
    for (const [index, exercise] of exercises.entries()) {
      const reps = `${exercise.repTargetMin}–${exercise.repTargetMax} reps`
      const detail = `${exercise.type}, ${exercise.muscleGroup}, ${reps}, +${exercise.weightIncrementLb} lb, ${exercise.restSeconds}s rest`
      console.log(`    ${index + 1}. ${exercise.name.padEnd(36)} ${dim(detail)}`)
    }
  }

  const mesocycle = await db.mesocycles.toCollection().first()
  const settings = await db.settings.get('app')

  heading('MESOCYCLE')
  console.log(`  starts        ${mesocycle?.startDate} (Monday)`)
  console.log(`  length        ${mesocycle?.totalWeeks} weeks`)
  console.log(`  deload week   ${mesocycle?.deloadWeek}`)
  console.log(`  status        ${mesocycle?.status}`)

  heading('DEFAULTS')
  console.log(`  weight increment   ${settings?.defaultWeightIncrementLb} lb`)
  console.log(`  rest, compound     ${settings?.defaultRestCompoundSeconds}s`)
  console.log(`  rest, isolation    ${settings?.defaultRestIsolationSeconds}s`)
  console.log(
    `  cardio             ${settings?.lastCardio.durationMin} min @ ${settings?.lastCardio.inclinePct}% incline, ${settings?.lastCardio.speedMph} mph`,
  )

  heading('THE WEEK, AS THE APP RESOLVES IT')
  // Walk a full week through the same query the home screen uses.
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(2026, 7, 17 + offset)
    const iso = `2026-08-${String(17 + offset).padStart(2, '0')}`
    const view = await getTodayView(iso)
    const label = (WEEKDAY_NAMES[date.getDay()] ?? '').padEnd(10)
    const body = view.template
      ? `Day ${view.template.letter} — ${view.template.name} ${dim(`(${view.exercises.length} exercises)`)}`
      : dim('Rest day')
    console.log(`  ${label} ${iso}   ${body}`)
  }

  heading('TODAY')
  const view = await getTodayView(today())
  console.log(`  ${formatLongDate(view.date)}`)
  if (view.template) {
    console.log(`  Day ${view.template.letter} — ${view.template.name}`)
    console.log(`  ${view.exercises.length} exercises`)
  } else {
    console.log(`  Rest day. Next: Day ${view.nextTemplate?.letter ?? '?'}`)
  }
  if (view.position) {
    console.log(
      `  Week ${view.position.weekNumber} of ${view.position.totalWeeks}${view.position.isDeloadWeek ? ' (deload)' : ''}`,
    )
  }
  console.log(`  Streak: ${view.streak}`)
  console.log()
}

main()
  .then(() => db.close())
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
