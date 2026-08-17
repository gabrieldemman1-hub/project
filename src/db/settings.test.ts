import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import {
  addExerciseToDay,
  addExerciseToLibrary,
  clearAppLock,
  moveExerciseInDay,
  removeExerciseFromDay,
  setAppLock,
  setTheme,
} from './mutations'
import { getSettingsView } from './queries'
import { seedIfEmpty } from './seed'
import { createLock, isValidPin, verifyPin } from '../lib/pin'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await seedIfEmpty(new Date(2026, 7, 16))
})

async function dayA() {
  const template = await db.dayTemplates.where('letter').equals('A').first()
  if (!template) throw new Error('no Day A')
  return template
}

describe('day template editing', () => {
  it('adds a library exercise to a day, once', async () => {
    const template = await dayA()
    const lateral = await db.exercises
      .where('name')
      .equals('Lateral raise dumbbells')
      .first()
    if (!lateral) throw new Error('missing library exercise')

    await addExerciseToDay(template.id, lateral.id)
    await addExerciseToDay(template.id, lateral.id) // second add is a no-op

    const after = await db.dayTemplates.get(template.id)
    expect(after?.exerciseIds.filter((id) => id === lateral.id)).toHaveLength(1)
    expect(after?.exerciseIds[after.exerciseIds.length - 1]).toBe(lateral.id)
  })

  it('removes and reorders without touching history', async () => {
    const template = await dayA()
    const [first, second] = template.exerciseIds
    if (!first || !second) throw new Error('need two')

    await moveExerciseInDay(template.id, second, 'up')
    expect((await db.dayTemplates.get(template.id))?.exerciseIds[0]).toBe(second)

    // Moving the top item up is a no-op, not a crash or a rotation.
    await moveExerciseInDay(template.id, second, 'up')
    expect((await db.dayTemplates.get(template.id))?.exerciseIds[0]).toBe(second)

    await removeExerciseFromDay(template.id, second)
    const after = await db.dayTemplates.get(template.id)
    expect(after?.exerciseIds).not.toContain(second)
    // The exercise itself survives in the library.
    expect(await db.exercises.get(second)).toBeDefined()
  })

  it('creates a new library exercise with sane defaults and validation', async () => {
    const groups = await db.muscleGroups.toArray()
    const chest = groups.find((g) => g.name === 'Chest')
    if (!chest) throw new Error('no chest group')

    const id = await addExerciseToLibrary({
      name: '  Cable crossover  ',
      type: 'isolation',
      muscleGroupId: chest.id,
      repTargetMin: 10,
      repTargetMax: 15,
    })
    const stored = await db.exercises.get(id)
    expect(stored?.name).toBe('Cable crossover')
    expect(stored?.restSeconds).toBe(120)
    expect(stored?.weightIncrementLb).toBe(5)

    await expect(
      addExerciseToLibrary({
        name: '',
        type: 'isolation',
        muscleGroupId: chest.id,
        repTargetMin: 10,
        repTargetMax: 15,
      }),
    ).rejects.toThrow(/name/i)
    await expect(
      addExerciseToLibrary({
        name: 'Bad range',
        type: 'isolation',
        muscleGroupId: chest.id,
        repTargetMin: 12,
        repTargetMax: 8,
      }),
    ).rejects.toThrow(/range/i)
  })
})

describe('appearance and lock settings', () => {
  it('persists the theme', async () => {
    await setTheme('light')
    expect((await db.settings.get('app'))?.theme).toBe('light')
    await setTheme('dark')
    expect((await db.settings.get('app'))?.theme).toBe('dark')
  })

  it('round-trips the app lock', async () => {
    const lock = await createLock('4321', 'the usual')
    await setAppLock(lock)
    const stored = (await db.settings.get('app'))?.appLock
    expect(stored?.hint).toBe('the usual')
    // Only a salted hash is stored — never the PIN itself.
    expect(JSON.stringify(stored)).not.toContain('4321')

    await clearAppLock()
    expect((await db.settings.get('app'))?.appLock).toBeNull()
  })
})

describe('pin hashing', () => {
  it('accepts 4–8 digits only', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('12345678')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('123456789')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })

  it('verifies the right PIN and rejects the wrong one', async () => {
    const lock = await createLock('080808', '')
    expect(await verifyPin(lock, '080808')).toBe(true)
    expect(await verifyPin(lock, '080809')).toBe(false)
  })

  it('salts: the same PIN never hashes the same twice', async () => {
    const a = await createLock('1234', '')
    const b = await createLock('1234', '')
    expect(a.hashHex).not.toBe(b.hashHex)
  })
})

describe('getSettingsView', () => {
  it('lists every block newest first with its session count', async () => {
    const view = await getSettingsView()
    expect(view.mesocycles).toHaveLength(1)
    expect(view.mesocycles[0]?.status).toBe('active')
    expect(view.exercises.length).toBeGreaterThanOrEqual(21)
    expect(view.templates.map((t) => t.letter)).toEqual(['A', 'B', 'C'])
  })
})
