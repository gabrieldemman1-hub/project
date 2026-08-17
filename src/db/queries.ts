/**
 * Every read the UI performs. Components import from here, never from db.ts —
 * that boundary is what lets a sync layer be added later without touching a
 * single component (CLAUDE.md).
 */

import { db } from './db'
import type {
  AppSettings,
  DayTemplate,
  Exercise,
  IsoDate,
  Mesocycle,
  Session,
} from './schema'
import {
  currentStreak,
  mesocyclePosition,
  templateForDate,
  type MesocyclePosition,
} from '../lib/schedule'
import { addDays } from '../lib/date'

export async function getSettings(): Promise<AppSettings | undefined> {
  return db.settings.get('app')
}

export async function getActiveMesocycle(): Promise<Mesocycle | undefined> {
  const settings = await db.settings.get('app')
  if (!settings) return undefined
  return db.mesocycles.get(settings.activeMesocycleId)
}

export async function getDayTemplates(): Promise<DayTemplate[]> {
  const templates = await db.dayTemplates.toArray()
  // Stable A, B, C ordering regardless of insertion order.
  return templates.sort((a, b) => a.letter.localeCompare(b.letter))
}

/** Resolves an ordered list of exercise ids, dropping any that no longer exist. */
export async function getExercisesByIds(
  ids: readonly string[],
): Promise<Exercise[]> {
  const found = await db.exercises.bulkGet([...ids])
  // bulkGet preserves request order and yields undefined for missing ids, which
  // happens if an exercise is deleted while a template still references it.
  return found.filter((exercise): exercise is Exercise => exercise !== undefined)
}

/**
 * An exercise with its muscle group's display name resolved, so components
 * never have to join tables themselves.
 */
export interface ExerciseView extends Exercise {
  muscleGroupName: string
}

async function withMuscleGroupNames(
  exercises: readonly Exercise[],
): Promise<ExerciseView[]> {
  if (exercises.length === 0) return []

  const groups = await db.muscleGroups.bulkGet(
    Array.from(new Set(exercises.map((exercise) => exercise.muscleGroupId))),
  )
  const nameById = new Map(
    groups
      .filter((group) => group !== undefined)
      .map((group) => [group.id, group.name]),
  )

  return exercises.map((exercise) => ({
    ...exercise,
    // A missing group means the row was deleted out from under the exercise;
    // showing nothing is better than showing a raw UUID.
    muscleGroupName: nameById.get(exercise.muscleGroupId) ?? '',
  }))
}

export async function getSessionForDate(
  date: IsoDate,
): Promise<Session | undefined> {
  return db.sessions.where('date').equals(date).first()
}

/**
 * Everything the home screen needs, assembled in one place so the component
 * stays a rendering concern.
 */
export interface TodayView {
  date: IsoDate
  /** Null on a rest day. */
  template: DayTemplate | null
  /** Ordered as the session will run. Empty on a rest day. */
  exercises: ExerciseView[]
  /** Tomorrow's template, so a rest day can say what is coming. */
  nextTemplate: DayTemplate | null
  /** Null before the first mesocycle exists, i.e. before the seed has run. */
  position: MesocyclePosition | null
  /** Today's session, if one has been started, completed or skipped. */
  session: Session | undefined
  streak: number
}

export async function getTodayView(date: IsoDate): Promise<TodayView> {
  const [templates, mesocycle, session, sessions] = await Promise.all([
    getDayTemplates(),
    getActiveMesocycle(),
    getSessionForDate(date),
    db.sessions.toArray(),
  ])

  const template = templateForDate(templates, date)
  const exercises = template
    ? await withMuscleGroupNames(await getExercisesByIds(template.exerciseIds))
    : []

  return {
    date,
    template,
    exercises,
    nextTemplate: templateForDate(templates, addDays(date, 1)),
    position: mesocycle ? mesocyclePosition(mesocycle, date) : null,
    session,
    streak: currentStreak(templates, sessions, date),
  }
}
