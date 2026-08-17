import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import { getTodayView } from './queries'
import {
  EXPECTED_LIBRARY_ONLY,
  EXPECTED_CARDIO_MINUTES,
  EXPECTED_EXERCISE_COUNT,
  EXPECTED_MESOCYCLE,
  EXPECTED_PROGRAM,
  EXPECTED_REST_SECONDS,
  EXPECTED_WEIGHT_INCREMENT_LB,
} from './program.fixture'
import { SEED_MUSCLE_GROUPS, seedIfEmpty } from './seed'
import type { Exercise } from './schema'

const SEEDED_ON = new Date(2026, 7, 19) // Wednesday 19 August 2026

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** Resolves the seeded exercises for a day, in template order, with group names. */
async function exercisesForDay(
  letter: 'A' | 'B' | 'C',
): Promise<Array<Exercise & { muscleGroupName: string }>> {
  const template = await db.dayTemplates.where('letter').equals(letter).first()
  if (!template) throw new Error(`Day ${letter} was not seeded`)

  const exercises = await db.exercises.bulkGet(template.exerciseIds)
  const groups = await db.muscleGroups.toArray()
  const nameById = new Map(groups.map((group) => [group.id, group.name]))

  return exercises.map((exercise, index) => {
    if (!exercise) throw new Error(`Day ${letter} exercise ${index} is dangling`)
    return {
      ...exercise,
      muscleGroupName: nameById.get(exercise.muscleGroupId) ?? '',
    }
  })
}

// These assert against src/db/program.fixture.ts — the brief transcribed by
// hand — rather than against the constants the seed is built from, so a wrong
// name, a flipped compound/isolation classification or a bad rep target fails
// here instead of reaching the gym.
describe('the seeded program matches BRIEF.md Part 4', () => {
  beforeEach(async () => {
    await seedIfEmpty(SEEDED_ON)
  })

  it('seeds the 15 programmed movements plus the library-only catalog', async () => {
    expect(await db.exercises.count()).toBe(
      EXPECTED_EXERCISE_COUNT + EXPECTED_LIBRARY_ONLY.length,
    )
  })

  it('ships the owner’s library exercises, attached to no day', async () => {
    const names = new Set((await db.exercises.toArray()).map((e) => e.name))
    for (const name of EXPECTED_LIBRARY_ONLY) {
      expect(names.has(name), `${name} missing from library`).toBe(true)
    }
    const templates = await db.dayTemplates.toArray()
    const templated = new Set(templates.flatMap((t) => t.exerciseIds))
    for (const name of EXPECTED_LIBRARY_ONLY) {
      const exercise = (await db.exercises.toArray()).find((e) => e.name === name)
      expect(exercise && templated.has(exercise.id)).toBe(false)
    }
  })

  it('tops up an already-seeded database with newly shipped library exercises', async () => {
    // Simulate a phone seeded before the catalog existed.
    const shipped = await db.exercises
      .filter((e) => EXPECTED_LIBRARY_ONLY.includes(e.name))
      .toArray()
    await db.exercises.bulkDelete(shipped.map((e) => e.id))
    expect(await db.exercises.count()).toBe(EXPECTED_EXERCISE_COUNT)

    // Next launch: seedIfEmpty on a seeded database adds the missing ones.
    await seedIfEmpty(SEEDED_ON)
    expect(await db.exercises.count()).toBe(
      EXPECTED_EXERCISE_COUNT + EXPECTED_LIBRARY_ONLY.length,
    )

    // And an edited copy is never overwritten by the top-up.
    const lateral = await db.exercises
      .where('name')
      .equals('Lateral raise dumbbells')
      .first()
    if (!lateral) throw new Error('missing')
    await db.exercises.update(lateral.id, { repTargetMax: 25 })
    await seedIfEmpty(SEEDED_ON)
    expect((await db.exercises.get(lateral.id))?.repTargetMax).toBe(25)
    expect(await db.exercises.count()).toBe(
      EXPECTED_EXERCISE_COUNT + EXPECTED_LIBRARY_ONLY.length,
    )
  })

  it('seeds three days, on the right weekdays, with the right names', async () => {
    const templates = await db.dayTemplates.toArray()
    expect(templates).toHaveLength(3)

    for (const expected of EXPECTED_PROGRAM) {
      const template = templates.find((t) => t.letter === expected.letter)
      expect(template, `Day ${expected.letter} missing`).toBeDefined()
      expect(template?.name).toBe(expected.name)
      expect(template?.weekdays).toEqual(expected.weekdays)
    }
  })

  for (const day of EXPECTED_PROGRAM) {
    describe(`Day ${day.letter} — ${day.name}`, () => {
      it('has the brief’s exercises, in the brief’s order', async () => {
        const seeded = await exercisesForDay(day.letter)
        expect(seeded.map((exercise) => exercise.name)).toEqual(
          day.exercises.map((exercise) => exercise.name),
        )
      })

      for (const [index, expected] of day.exercises.entries()) {
        it(`${expected.name}: ${expected.type}, ${expected.muscleGroup}, ${expected.reps[0]}–${expected.reps[1]} reps`, async () => {
          const seeded = (await exercisesForDay(day.letter))[index]
          expect(seeded).toBeDefined()
          expect(seeded?.name).toBe(expected.name)
          expect(seeded?.type).toBe(expected.type)
          expect(seeded?.muscleGroupName).toBe(expected.muscleGroup)
          expect(seeded?.repTargetMin).toBe(expected.reps[0])
          expect(seeded?.repTargetMax).toBe(expected.reps[1])
          // Part 4: compound 150s, isolation 120s, 5 lb increment.
          expect(seeded?.restSeconds).toBe(EXPECTED_REST_SECONDS[expected.type])
          expect(seeded?.weightIncrementLb).toBe(EXPECTED_WEIGHT_INCREMENT_LB)
        })
      }
    })
  }

  it('sets up the mesocycle as five accumulation weeks plus a deload', async () => {
    const mesocycle = await db.mesocycles.toCollection().first()
    expect(mesocycle?.totalWeeks).toBe(EXPECTED_MESOCYCLE.totalWeeks)
    expect(mesocycle?.deloadWeek).toBe(EXPECTED_MESOCYCLE.deloadWeek)
    expect(mesocycle?.status).toBe('active')
    // Started on the Monday of the seeding week.
    expect(mesocycle?.startDate).toBe('2026-08-17')
  })

  it('pre-fills cardio with the brief’s 45 minutes', async () => {
    const settings = await db.settings.get('app')
    expect(settings?.lastCardio.durationMin).toBe(EXPECTED_CARDIO_MINUTES)
  })

  it('points settings at the mesocycle it created', async () => {
    const settings = await db.settings.get('app')
    const mesocycle = await db.mesocycles.toCollection().first()
    expect(settings?.activeMesocycleId).toBe(mesocycle?.id)
  })
})

describe('muscle groups', () => {
  beforeEach(async () => {
    await seedIfEmpty(SEEDED_ON)
  })

  it('gives every exercise a resolvable muscle group', async () => {
    const exercises = await db.exercises.toArray()
    const groupIds = new Set((await db.muscleGroups.toArray()).map((g) => g.id))

    for (const exercise of exercises) {
      expect(
        groupIds.has(exercise.muscleGroupId),
        `${exercise.name} points at a missing muscle group`,
      ).toBe(true)
    }
  })

  it('covers every exercise by a prompt or an inherited one', async () => {
    // PLAN.md §2.3 trims the prompt list, so any group left out must inherit
    // from one that is prompted for — otherwise an exercise gets no soreness
    // answer at all and the engine has nothing to work from.
    const groups = await db.muscleGroups.toArray()
    const groupById = new Map(groups.map((group) => [group.id, group]))

    for (const template of await db.dayTemplates.toArray()) {
      const prompted = new Set(template.sorenessPromptGroupIds)
      const exercises = await db.exercises.bulkGet(template.exerciseIds)

      for (const exercise of exercises) {
        if (!exercise) throw new Error('dangling exercise')
        const group = groupById.get(exercise.muscleGroupId)
        const covered =
          prompted.has(exercise.muscleGroupId) ||
          (group?.inheritsFromId != null && prompted.has(group.inheritsFromId))

        expect(
          covered,
          `Day ${template.letter}: "${exercise.name}" (${group?.name}) has no soreness answer`,
        ).toBe(true)
      }
    }
  })

  it('resolves every declared inheritance to a real group', async () => {
    const groups = await db.muscleGroups.toArray()
    const byId = new Map(groups.map((group) => [group.id, group]))

    const inheriting = groups.filter((group) => group.inheritsFromId !== null)
    // Guards the test itself: if nothing inherits, the check above is vacuous.
    expect(inheriting.length).toBe(
      SEED_MUSCLE_GROUPS.filter((group) => group.inheritsFrom !== null).length,
    )

    for (const group of inheriting) {
      expect(byId.has(group.inheritsFromId ?? '')).toBe(true)
    }
  })
})

describe('mesocycle anchoring', () => {
  it('seeding on a Sunday anchors the block to the coming Monday, not the past one', async () => {
    // Seeded Sunday 16 Aug: week 1 must be the week starting Monday the 17th.
    // The naive startOfWeek answer (Monday the 10th) would read "Week 2 of 6"
    // the day after installing the app, without a single session trained.
    await seedIfEmpty(new Date(2026, 7, 16))
    const mesocycle = await db.mesocycles.toCollection().first()
    expect(mesocycle?.startDate).toBe('2026-08-17')
  })

  it('repairs an old wrongly-anchored block while nothing has been trained', async () => {
    await seedIfEmpty(new Date(2026, 7, 16))
    // Simulate the pre-fix state a phone may still carry.
    const mesocycle = await db.mesocycles.toCollection().first()
    if (!mesocycle) throw new Error('no mesocycle')
    await db.mesocycles.update(mesocycle.id, { startDate: '2026-08-10' })

    // Next launch (Monday the 17th) runs the seed again; with zero sessions it
    // re-anchors to the current training week.
    await seedIfEmpty(new Date(2026, 7, 17))
    expect((await db.mesocycles.get(mesocycle.id))?.startDate).toBe('2026-08-17')
  })

  it('never moves the block once any session exists', async () => {
    await seedIfEmpty(new Date(2026, 7, 16))
    const mesocycle = await db.mesocycles.toCollection().first()
    if (!mesocycle) throw new Error('no mesocycle')

    const template = await db.dayTemplates.where('letter').equals('A').first()
    if (!template) throw new Error('no template')
    await db.sessions.add({
      id: 'session-1',
      date: '2026-08-17',
      dayTemplateId: template.id,
      mesocycleId: mesocycle.id,
      weekNumber: 1,
      isDeload: false,
      status: 'completed',
      currentExerciseIndex: 0,
      cardio: null,
      startedAt: 1,
      completedAt: 2,
      updatedAt: 2,
    })

    // A week of not launching, then a launch the following Sunday: the block
    // must stay where the training history says it is.
    await seedIfEmpty(new Date(2026, 7, 30))
    expect((await db.mesocycles.get(mesocycle.id))?.startDate).toBe('2026-08-17')
  })
})

describe('seedIfEmpty', () => {
  it('is idempotent — a second call writes nothing', async () => {
    expect(await seedIfEmpty(SEEDED_ON)).toBe(true)
    const before = await db.exercises.count()

    expect(await seedIfEmpty(SEEDED_ON)).toBe(false)

    expect(await db.exercises.count()).toBe(before)
    expect(await db.dayTemplates.count()).toBe(3)
    expect(await db.muscleGroups.count()).toBe(SEED_MUSCLE_GROUPS.length)
  })

  it('never overwrites an edited exercise on relaunch', async () => {
    // The seed runs on every launch, so an edit made in Settings must survive it.
    await seedIfEmpty(SEEDED_ON)
    const legPress = await db.exercises.where('name').equals('Leg press').first()
    if (!legPress) throw new Error('expected Leg press to be seeded')

    await db.exercises.update(legPress.id, { weightIncrementLb: 15 })
    await seedIfEmpty(SEEDED_ON)

    expect((await db.exercises.get(legPress.id))?.weightIncrementLb).toBe(15)
  })

  it('gives every row a UUID primary key so a sync layer can be added later', async () => {
    await seedIfEmpty(SEEDED_ON)
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    const ids = [
      ...(await db.exercises.toArray()),
      ...(await db.dayTemplates.toArray()),
      ...(await db.muscleGroups.toArray()),
      ...(await db.mesocycles.toArray()),
    ].map((row) => row.id)

    for (const id of ids) expect(id).toMatch(uuid)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('stamps every row with updatedAt so a future sync can resolve conflicts', async () => {
    await seedIfEmpty(SEEDED_ON)

    const rows = [
      ...(await db.exercises.toArray()),
      ...(await db.dayTemplates.toArray()),
      ...(await db.muscleGroups.toArray()),
      ...(await db.mesocycles.toArray()),
    ]

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(typeof row.updatedAt).toBe('number')
  })
})

describe('getTodayView', () => {
  beforeEach(async () => {
    await seedIfEmpty(SEEDED_ON)
  })

  it('returns Wednesday as Day C with its six exercises in order', async () => {
    const view = await getTodayView('2026-08-19')

    expect(view.template?.letter).toBe('C')
    expect(view.template?.name).toBe('Back, Biceps & Shoulders')
    expect(view.exercises).toHaveLength(6)
    expect(view.exercises[0]?.name).toBe('Wide-grip lat pulldown')
    expect(view.exercises[5]?.name).toBe('Cable lateral raise')
    expect(view.position?.weekNumber).toBe(1)
    expect(view.position?.totalWeeks).toBe(6)
  })

  it('resolves muscle group names for display', async () => {
    const view = await getTodayView('2026-08-19')
    expect(view.exercises[0]?.muscleGroupName).toBe('Back')
    expect(view.exercises[5]?.muscleGroupName).toBe('Shoulders')
  })

  it('returns a rest day on Sunday, and names what is next', async () => {
    const view = await getTodayView('2026-08-23')

    expect(view.template).toBeNull()
    expect(view.exercises).toEqual([])
    expect(view.nextTemplate?.letter).toBe('A')
  })

  it('drops an exercise that a template still references after deletion', async () => {
    // A template can outlive an exercise the user removed; the day must still
    // render rather than crashing on a dangling id.
    const template = await db.dayTemplates.where('letter').equals('C').first()
    const firstId = template?.exerciseIds[0]
    if (!firstId) throw new Error('expected Day C to have exercises')

    await db.exercises.delete(firstId)
    const view = await getTodayView('2026-08-19')

    expect(view.exercises).toHaveLength(5)
    expect(view.exercises.map((e) => e.id)).not.toContain(firstId)
  })

  it('survives a muscle group being deleted out from under an exercise', async () => {
    const groups = await db.muscleGroups.toArray()
    const back = groups.find((group) => group.name === 'Back')
    if (!back) throw new Error('expected a Back muscle group')

    await db.muscleGroups.delete(back.id)
    const view = await getTodayView('2026-08-19')

    // Renders rather than throwing, and shows nothing rather than a raw UUID.
    expect(view.exercises).toHaveLength(6)
    expect(view.exercises[0]?.muscleGroupName).toBe('')
  })
})
