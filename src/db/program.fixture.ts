/**
 * BRIEF.md Part 4, transcribed by hand as literal values.
 *
 * This exists so the seed tests assert against the brief rather than against
 * the same constants the seed is built from. Deriving expectations from
 * `SEED_DAYS` only proves the seed reaches the database intact — it would pass
 * just as happily with a missing exercise, a flipped compound/isolation
 * classification, or the wrong rep target. Every number below was read off the
 * brief's tables, not copied from the implementation.
 *
 * If the program legitimately changes, this file and the seed must both be
 * edited. That duplication is the point.
 */

export interface ExpectedExercise {
  name: string
  type: 'compound' | 'isolation'
  muscleGroup: string
  reps: [min: number, max: number]
}

export interface ExpectedDay {
  letter: 'A' | 'B' | 'C'
  name: string
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: [number, number]
  exercises: ExpectedExercise[]
}

/** Part 4: rest timers. */
export const EXPECTED_REST_SECONDS = { compound: 150, isolation: 120 } as const

/** Part 4: "Default weight increment is 5 lb". */
export const EXPECTED_WEIGHT_INCREMENT_LB = 5

/** Part 4: "Every session ends with 45 minutes of incline treadmill walking." */
export const EXPECTED_CARDIO_MINUTES = 45

/** Part 5: five weeks of accumulation, then week six is a deload. */
export const EXPECTED_MESOCYCLE = { totalWeeks: 6, deloadWeek: 6 } as const

export const EXPECTED_PROGRAM: readonly ExpectedDay[] = [
  {
    letter: 'A',
    name: 'Chest & Triceps',
    weekdays: [1, 4], // Mon, Thu
    exercises: [
      {
        name: 'Incline hammer strength press',
        type: 'compound',
        muscleGroup: 'Chest',
        reps: [8, 12],
      },
      {
        name: 'Flat or low-incline machine press',
        type: 'compound',
        muscleGroup: 'Chest',
        reps: [8, 12],
      },
      {
        name: 'Pec deck fly',
        type: 'isolation',
        muscleGroup: 'Chest',
        reps: [10, 15],
      },
      {
        name: 'Straight bar cable pushdown',
        type: 'isolation',
        muscleGroup: 'Triceps',
        reps: [10, 15],
      },
      {
        name: 'Overhead tricep extension machine',
        type: 'isolation',
        muscleGroup: 'Triceps',
        reps: [10, 15],
      },
    ],
  },
  {
    letter: 'B',
    name: 'Legs',
    weekdays: [2, 5], // Tue, Fri
    exercises: [
      {
        name: 'Leg press',
        type: 'compound',
        muscleGroup: 'Quads',
        reps: [8, 12],
      },
      {
        name: 'Quad extension',
        type: 'isolation',
        muscleGroup: 'Quads',
        reps: [10, 15],
      },
      {
        name: 'Romanian deadlift',
        type: 'compound',
        muscleGroup: 'Hamstrings',
        reps: [8, 12],
      },
      {
        name: 'Standing calf raise',
        type: 'isolation',
        muscleGroup: 'Calves',
        reps: [12, 20],
      },
    ],
  },
  {
    letter: 'C',
    name: 'Back, Biceps & Shoulders',
    weekdays: [3, 6], // Wed, Sat
    exercises: [
      {
        name: 'Wide-grip lat pulldown',
        type: 'compound',
        muscleGroup: 'Back',
        reps: [8, 12],
      },
      {
        name: 'Seated cable row',
        type: 'compound',
        muscleGroup: 'Back',
        reps: [8, 12],
      },
      {
        name: 'Cable rear delt fly',
        type: 'isolation',
        muscleGroup: 'Shoulders',
        reps: [12, 20],
      },
      {
        name: 'Machine preacher curl',
        type: 'isolation',
        muscleGroup: 'Biceps',
        reps: [10, 15],
      },
      {
        name: 'Incline dumbbell curl',
        type: 'isolation',
        muscleGroup: 'Biceps',
        reps: [10, 15],
      },
      {
        name: 'Cable lateral raise',
        type: 'isolation',
        muscleGroup: 'Shoulders',
        reps: [12, 20],
      },
    ],
  },
]

/** Part 4 lists 15 movements across the three days. */
export const EXPECTED_EXERCISE_COUNT = 15
