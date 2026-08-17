/**
 * Seeds the program from BRIEF.md Part 4.
 *
 * This is a starting point, not a hardcoded structure — every exercise, day
 * template, increment and rest time is editable from Settings once Phase 7
 * lands. The seed only ever runs on an empty database.
 */

import { db } from './db'
import type { DayTemplate, Exercise, ExerciseType, MuscleGroup } from './schema'
import { newId } from '../lib/ids'
import { toIsoDate, upcomingTrainingWeekStart } from '../lib/date'

export const DEFAULT_WEIGHT_INCREMENT_LB = 5
export const DEFAULT_REST_COMPOUND_SECONDS = 150
export const DEFAULT_REST_ISOLATION_SECONDS = 120

/** Five accumulation weeks, then week six is a deload (BRIEF.md Part 5). */
export const MESOCYCLE_TOTAL_WEEKS = 6
export const MESOCYCLE_DELOAD_WEEK = 6

/** Every session ends with 45 minutes of incline treadmill walking. */
export const DEFAULT_CARDIO = {
  durationMin: 45,
  inclinePct: 10,
  speedMph: 3,
} as const

/**
 * The muscles this program trains. `inheritsFrom` names the group whose
 * soreness answer stands in when this one is not prompted for directly, so no
 * exercise is ever left without an answer while the prompt list stays short
 * (PLAN.md §2.3).
 */
export const SEED_MUSCLE_GROUPS: ReadonlyArray<{
  name: string
  inheritsFrom: string | null
}> = [
  { name: 'Chest', inheritsFrom: null },
  { name: 'Triceps', inheritsFrom: null },
  { name: 'Quads', inheritsFrom: null },
  { name: 'Hamstrings', inheritsFrom: null },
  // Day B prompts for quads and hamstrings only; calves ride along with quads
  // rather than adding a third question. Revisit when Phase 4 puts the real
  // feedback screens in front of the user.
  { name: 'Calves', inheritsFrom: 'Quads' },
  { name: 'Back', inheritsFrom: null },
  { name: 'Biceps', inheritsFrom: null },
  { name: 'Shoulders', inheritsFrom: null },
]

interface SeedExercise {
  name: string
  type: ExerciseType
  muscleGroup: string
  repTargetMin: number
  repTargetMax: number
}

interface SeedDay {
  letter: 'A' | 'B' | 'C'
  name: string
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[]
  /**
   * Which muscle groups get a soreness prompt. Deliberately narrower than the
   * set of muscle groups below — see PLAN.md §2.3. Adjustable in Settings.
   */
  sorenessPrompts: string[]
  exercises: SeedExercise[]
}

export const SEED_DAYS: readonly SeedDay[] = [
  {
    letter: 'A',
    name: 'Chest & Triceps',
    weekdays: [1, 4], // Monday, Thursday
    sorenessPrompts: ['Chest', 'Triceps'],
    exercises: [
      {
        name: 'Incline hammer strength press',
        type: 'compound',
        muscleGroup: 'Chest',
        repTargetMin: 8,
        repTargetMax: 12,
      },
      {
        name: 'Flat or low-incline machine press',
        type: 'compound',
        muscleGroup: 'Chest',
        repTargetMin: 8,
        repTargetMax: 12,
      },
      {
        name: 'Pec deck fly',
        type: 'isolation',
        muscleGroup: 'Chest',
        repTargetMin: 10,
        repTargetMax: 15,
      },
      {
        name: 'Straight bar cable pushdown',
        type: 'isolation',
        muscleGroup: 'Triceps',
        repTargetMin: 10,
        repTargetMax: 15,
      },
      {
        name: 'Overhead tricep extension machine',
        type: 'isolation',
        muscleGroup: 'Triceps',
        repTargetMin: 10,
        repTargetMax: 15,
      },
    ],
  },
  {
    letter: 'B',
    name: 'Legs',
    weekdays: [2, 5], // Tuesday, Friday
    sorenessPrompts: ['Quads', 'Hamstrings'],
    exercises: [
      {
        name: 'Leg press',
        type: 'compound',
        muscleGroup: 'Quads',
        repTargetMin: 8,
        repTargetMax: 12,
      },
      {
        name: 'Quad extension',
        type: 'isolation',
        muscleGroup: 'Quads',
        repTargetMin: 10,
        repTargetMax: 15,
      },
      {
        name: 'Romanian deadlift',
        type: 'compound',
        muscleGroup: 'Hamstrings',
        repTargetMin: 8,
        repTargetMax: 12,
      },
      {
        name: 'Standing calf raise',
        type: 'isolation',
        muscleGroup: 'Calves',
        repTargetMin: 12,
        repTargetMax: 20,
      },
    ],
  },
  {
    letter: 'C',
    name: 'Back, Biceps & Shoulders',
    weekdays: [3, 6], // Wednesday, Saturday
    sorenessPrompts: ['Back', 'Biceps', 'Shoulders'],
    exercises: [
      {
        name: 'Wide-grip lat pulldown',
        type: 'compound',
        muscleGroup: 'Back',
        repTargetMin: 8,
        repTargetMax: 12,
      },
      {
        name: 'Seated cable row',
        type: 'compound',
        muscleGroup: 'Back',
        repTargetMin: 8,
        repTargetMax: 12,
      },
      {
        name: 'Cable rear delt fly',
        type: 'isolation',
        muscleGroup: 'Shoulders',
        repTargetMin: 12,
        repTargetMax: 20,
      },
      {
        name: 'Machine preacher curl',
        type: 'isolation',
        muscleGroup: 'Biceps',
        repTargetMin: 10,
        repTargetMax: 15,
      },
      {
        name: 'Incline dumbbell curl',
        type: 'isolation',
        muscleGroup: 'Biceps',
        repTargetMin: 10,
        repTargetMax: 15,
      },
      {
        name: 'Cable lateral raise',
        type: 'isolation',
        muscleGroup: 'Shoulders',
        repTargetMin: 12,
        repTargetMax: 20,
      },
    ],
  },
]

/**
 * Repairs a mesocycle created by the old Sunday seed bug.
 *
 * A database seeded on a Sunday before this fix anchored its first block to
 * the Monday six days earlier, so the user's counter jumped to "Week 2" the
 * day after install. While not a single session has ever been recorded, the
 * block is provably untrained and can be safely re-anchored to the current
 * training week. The moment any session exists — even a skipped one — this
 * never moves anything again.
 */
async function reanchorUntrainedMesocycle(now: Date): Promise<void> {
  await db.transaction('rw', [db.sessions, db.mesocycles, db.settings], async () => {
    if ((await db.sessions.count()) > 0) return

    const settings = await db.settings.get('app')
    if (!settings) return
    const mesocycle = await db.mesocycles.get(settings.activeMesocycleId)
    if (!mesocycle || mesocycle.status !== 'active') return

    const anchor = upcomingTrainingWeekStart(toIsoDate(now))
    if (mesocycle.startDate === anchor) return

    await db.mesocycles.update(mesocycle.id, {
      startDate: anchor,
      updatedAt: now.getTime(),
    })
  })
}

/**
 * Library-only movements (product owner's list): saved and ready to add to
 * any day or block from Settings, attached to no day by default.
 */
export const EXTRA_LIBRARY: readonly SeedExercise[] = [
  { name: 'Lateral raise dumbbells', type: 'isolation', muscleGroup: 'Shoulders', repTargetMin: 12, repTargetMax: 20 },
  { name: 'Pec deck rear delt fly', type: 'isolation', muscleGroup: 'Shoulders', repTargetMin: 12, repTargetMax: 20 },
  { name: 'Single arm tricep push down (handle)', type: 'isolation', muscleGroup: 'Triceps', repTargetMin: 10, repTargetMax: 15 },
  { name: 'Single arm tricep push down (rope)', type: 'isolation', muscleGroup: 'Triceps', repTargetMin: 10, repTargetMax: 15 },
  { name: 'Incline dumbbell press', type: 'compound', muscleGroup: 'Chest', repTargetMin: 8, repTargetMax: 12 },
  { name: 'Incline barbell press smith machine', type: 'compound', muscleGroup: 'Chest', repTargetMin: 8, repTargetMax: 12 },
]

/**
 * Adds any catalog exercise missing from the library, by name — the path by
 * which an already-seeded phone receives newly shipped movements. Never
 * touches an existing exercise, so edits made in Settings always survive.
 */
async function topUpLibrary(now: Date): Promise<void> {
  const timestamp = now.getTime()
  await db.transaction('rw', [db.exercises, db.muscleGroups], async () => {
    const existingNames = new Set((await db.exercises.toArray()).map((e) => e.name))
    const groups = await db.muscleGroups.toArray()
    const groupIdByName = new Map(groups.map((g) => [g.name, g.id]))

    for (const seed of EXTRA_LIBRARY) {
      if (existingNames.has(seed.name)) continue
      const muscleGroupId = groupIdByName.get(seed.muscleGroup)
      if (!muscleGroupId) continue
      await db.exercises.add({
        id: newId(),
        name: seed.name,
        type: seed.type,
        muscleGroupId,
        repTargetMin: seed.repTargetMin,
        repTargetMax: seed.repTargetMax,
        weightIncrementLb: DEFAULT_WEIGHT_INCREMENT_LB,
        restSeconds: defaultRestSeconds(seed.type),
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  })
}

function defaultRestSeconds(type: ExerciseType): number {
  return type === 'compound'
    ? DEFAULT_REST_COMPOUND_SECONDS
    : DEFAULT_REST_ISOLATION_SECONDS
}

/**
 * Populates an empty database with the Part 4 program.
 *
 * Idempotent: if anything is already seeded this returns without touching a
 * thing, so it is safe to call on every launch. It never overwrites edits.
 *
 * @returns whether a seed was actually written.
 */
export async function seedIfEmpty(now: Date = new Date()): Promise<boolean> {
  const alreadySeeded = await db.settings.get('app')
  if (alreadySeeded) {
    await reanchorUntrainedMesocycle(now)
    await topUpLibrary(now)
    return false
  }

  const timestamp = now.getTime()

  // Muscle groups first — everything else references them by id.
  const muscleGroups: MuscleGroup[] = SEED_MUSCLE_GROUPS.map((group) => ({
    id: newId(),
    name: group.name,
    inheritsFromId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
  const muscleGroupIdByName = new Map(muscleGroups.map((g) => [g.name, g.id]))

  // Second pass, now that every group has an id, to wire up inheritance.
  for (const [index, seed] of SEED_MUSCLE_GROUPS.entries()) {
    if (!seed.inheritsFrom) continue
    const parentId = muscleGroupIdByName.get(seed.inheritsFrom)
    if (!parentId) {
      throw new Error(
        `Muscle group "${seed.name}" inherits from unknown group "${seed.inheritsFrom}"`,
      )
    }
    const group = muscleGroups[index]
    if (group) group.inheritsFromId = parentId
  }

  function muscleGroupId(name: string): string {
    const id = muscleGroupIdByName.get(name)
    if (!id) throw new Error(`Exercise references unknown muscle group "${name}"`)
    return id
  }

  const exercises: Exercise[] = []
  const dayTemplates: DayTemplate[] = []

  for (const day of SEED_DAYS) {
    const exerciseIds: string[] = []

    for (const seed of day.exercises) {
      const exercise: Exercise = {
        id: newId(),
        name: seed.name,
        type: seed.type,
        muscleGroupId: muscleGroupId(seed.muscleGroup),
        repTargetMin: seed.repTargetMin,
        repTargetMax: seed.repTargetMax,
        weightIncrementLb: DEFAULT_WEIGHT_INCREMENT_LB,
        restSeconds: defaultRestSeconds(seed.type),
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      exercises.push(exercise)
      exerciseIds.push(exercise.id)
    }

    dayTemplates.push({
      id: newId(),
      letter: day.letter,
      name: day.name,
      weekdays: [...day.weekdays],
      exerciseIds,
      sorenessPromptGroupIds: day.sorenessPrompts.map(muscleGroupId),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  // The first block is created automatically so the app works out of the box;
  // every one after this is started by hand from Settings (PLAN.md A-4).
  const mesocycleId = newId()

  // Set inside the transaction, so the return value reports what was actually
  // written rather than what was intended.
  let wrote = false

  await db.transaction(
    'rw',
    [db.muscleGroups, db.exercises, db.dayTemplates, db.mesocycles, db.settings],
    async () => {
      // Re-check inside the transaction so two tabs racing on first launch
      // cannot both seed.
      if (await db.settings.get('app')) return

      await db.muscleGroups.bulkAdd(muscleGroups)
      await db.exercises.bulkAdd(exercises)
      // The library-only catalog ships on fresh installs too.
      await db.exercises.bulkAdd(
        EXTRA_LIBRARY.flatMap((seed) => {
          const muscleGroupId = muscleGroupIdByName.get(seed.muscleGroup)
          if (!muscleGroupId) return []
          return [
            {
              id: newId(),
              name: seed.name,
              type: seed.type,
              muscleGroupId,
              repTargetMin: seed.repTargetMin,
              repTargetMax: seed.repTargetMax,
              weightIncrementLb: DEFAULT_WEIGHT_INCREMENT_LB,
              restSeconds: defaultRestSeconds(seed.type),
              isArchived: false,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ]
        }),
      )
      await db.dayTemplates.bulkAdd(dayTemplates)
      await db.mesocycles.add({
        id: mesocycleId,
        // upcomingTrainingWeekStart, not startOfWeek: seeding on a Sunday must
        // anchor the block to the Monday about to start, not the one six days
        // gone — otherwise the counter says "Week 2" before a single session.
        startDate: upcomingTrainingWeekStart(toIsoDate(now)),
        totalWeeks: MESOCYCLE_TOTAL_WEEKS,
        deloadWeek: MESOCYCLE_DELOAD_WEEK,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      await db.settings.add({
        id: 'app',
        activeMesocycleId: mesocycleId,
        lastCardio: { ...DEFAULT_CARDIO },
        defaultWeightIncrementLb: DEFAULT_WEIGHT_INCREMENT_LB,
        defaultRestCompoundSeconds: DEFAULT_REST_COMPOUND_SECONDS,
        defaultRestIsolationSeconds: DEFAULT_REST_ISOLATION_SECONDS,
        seededAt: timestamp,
        updatedAt: timestamp,
      })
      wrote = true
    },
  )

  return wrote
}
