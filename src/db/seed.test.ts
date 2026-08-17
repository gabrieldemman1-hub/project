import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import { getTodayView } from './queries'
import {
  DEFAULT_REST_COMPOUND_SECONDS,
  DEFAULT_REST_ISOLATION_SECONDS,
  DEFAULT_WEIGHT_INCREMENT_LB,
  SEED_DAYS,
  seedIfEmpty,
} from './seed'

const SEEDED_ON = new Date(2026, 7, 19) // Wednesday 19 August 2026

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('seedIfEmpty', () => {
  it('writes the Part 4 program on an empty database', async () => {
    expect(await seedIfEmpty(SEEDED_ON)).toBe(true)

    const expectedExerciseCount = SEED_DAYS.reduce(
      (total, day) => total + day.exercises.length,
      0,
    )
    expect(await db.exercises.count()).toBe(expectedExerciseCount)
    expect(await db.dayTemplates.count()).toBe(3)
    expect(await db.mesocycles.count()).toBe(1)
    expect(await db.settings.count()).toBe(1)
  })

  it('is idempotent — a second call writes nothing', async () => {
    await seedIfEmpty(SEEDED_ON)
    const before = await db.exercises.count()

    expect(await seedIfEmpty(SEEDED_ON)).toBe(false)

    expect(await db.exercises.count()).toBe(before)
    expect(await db.dayTemplates.count()).toBe(3)
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

  it('gives every exercise a UUID primary key so a sync layer can be added later', async () => {
    await seedIfEmpty(SEEDED_ON)
    const exercises = await db.exercises.toArray()

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const exercise of exercises) {
      expect(exercise.id).toMatch(uuid)
    }
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length)
  })

  it('applies the Part 4 rest times and weight increment', async () => {
    await seedIfEmpty(SEEDED_ON)
    const exercises = await db.exercises.toArray()

    for (const exercise of exercises) {
      expect(exercise.weightIncrementLb).toBe(DEFAULT_WEIGHT_INCREMENT_LB)
      expect(exercise.restSeconds).toBe(
        exercise.type === 'compound'
          ? DEFAULT_REST_COMPOUND_SECONDS
          : DEFAULT_REST_ISOLATION_SECONDS,
      )
    }
  })

  it('maps the days onto the right weekdays', async () => {
    await seedIfEmpty(SEEDED_ON)
    const templates = await db.dayTemplates.toArray()

    const byLetter = Object.fromEntries(templates.map((t) => [t.letter, t]))
    expect(byLetter['A']?.weekdays).toEqual([1, 4])
    expect(byLetter['B']?.weekdays).toEqual([2, 5])
    expect(byLetter['C']?.weekdays).toEqual([3, 6])
  })

  it('orders each day’s exercises exactly as the brief lists them', async () => {
    await seedIfEmpty(SEEDED_ON)

    for (const day of SEED_DAYS) {
      const template = await db.dayTemplates.where('letter').equals(day.letter).first()
      if (!template) throw new Error(`expected day ${day.letter} to be seeded`)

      const resolved = await db.exercises.bulkGet(template.exerciseIds)
      expect(resolved.map((exercise) => exercise?.name)).toEqual(
        day.exercises.map((exercise) => exercise.name),
      )
    }
  })

  it('starts the first mesocycle on the Monday of the seeding week', async () => {
    await seedIfEmpty(SEEDED_ON)
    const mesocycle = await db.mesocycles.toCollection().first()

    expect(mesocycle?.startDate).toBe('2026-08-17')
    expect(mesocycle?.totalWeeks).toBe(6)
    expect(mesocycle?.deloadWeek).toBe(6)
    expect(mesocycle?.status).toBe('active')
  })

  it('points settings at the mesocycle it created', async () => {
    await seedIfEmpty(SEEDED_ON)
    const settings = await db.settings.get('app')
    const mesocycle = await db.mesocycles.toCollection().first()

    expect(settings?.activeMesocycleId).toBe(mesocycle?.id)
    expect(settings?.lastCardio.durationMin).toBe(45)
  })
})

describe('getTodayView', () => {
  it('returns Wednesday as Day C with its six exercises in order', async () => {
    await seedIfEmpty(SEEDED_ON)
    const view = await getTodayView('2026-08-19')

    expect(view.template?.letter).toBe('C')
    expect(view.template?.name).toBe('Back, Biceps & Shoulders')
    expect(view.exercises).toHaveLength(6)
    expect(view.exercises[0]?.name).toBe('Wide-grip lat pulldown')
    expect(view.exercises[5]?.name).toBe('Cable lateral raise')
    expect(view.position?.weekNumber).toBe(1)
    expect(view.position?.totalWeeks).toBe(6)
  })

  it('returns a rest day on Sunday, and names what is next', async () => {
    await seedIfEmpty(SEEDED_ON)
    const view = await getTodayView('2026-08-23')

    expect(view.template).toBeNull()
    expect(view.exercises).toEqual([])
    expect(view.nextTemplate?.letter).toBe('A')
  })

  it('drops an exercise that a template still references after deletion', async () => {
    // A template can outlive an exercise the user removed; the day must still
    // render rather than crashing on a dangling id.
    await seedIfEmpty(SEEDED_ON)
    const template = await db.dayTemplates.where('letter').equals('C').first()
    const firstId = template?.exerciseIds[0]
    if (!firstId) throw new Error('expected Day C to have exercises')

    await db.exercises.delete(firstId)
    const view = await getTodayView('2026-08-19')

    expect(view.exercises).toHaveLength(5)
    expect(view.exercises.map((e) => e.id)).not.toContain(firstId)
  })
})
