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
  ExerciseFeedback,
  IsoDate,
  LoggedSet,
  Mesocycle,
  Prescription,
  Session,
} from './schema'
import {
  currentStreak,
  mesocyclePosition,
  templateForDate,
  type MesocyclePosition,
} from '../lib/schedule'
import { addDays } from '../lib/date'
import { DEFAULT_CARDIO } from './seed'

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
  /**
   * A session from an earlier date still sitting in progress — a workout that
   * crossed midnight, or an app closed mid-session and not reopened until the
   * next day. Offered for finishing until a new session is started.
   */
  unfinishedSession: Session | undefined
  /** Sets logged in today's session, for the completed-day summary. */
  setsLoggedToday: number
  /** Last session's cardio duration, which is what today will be pre-filled with. */
  cardioMinutes: number
  streak: number
}

/**
 * The most recent *completed* session's sets for an exercise, in set order —
 * the greyed-out target to beat (BRIEF Part 5). In-progress and skipped
 * sessions never count: an abandoned half-workout is not a benchmark.
 */
export interface PreviousExerciseHistory {
  session: Session
  sets: LoggedSet[]
}

/** The most recent completed session in which this exercise was performed. */
export async function getPreviousExerciseHistory(
  exerciseId: string,
  excludeSessionId: string,
): Promise<PreviousExerciseHistory | null> {
  const completed = await db.sessions
    .where('status')
    .equals('completed')
    .toArray()

  // Deload sessions are never a benchmark: the numbers to beat are the last
  // real working numbers, matching what the engine itself progresses from.
  const candidates = completed
    .filter((session) => session.id !== excludeSessionId && !session.isDeload)
    .sort((a, b) => b.date.localeCompare(a.date))

  for (const session of candidates) {
    const sets = await db.sets
      .where('[sessionId+exerciseId]')
      .equals([session.id, exerciseId])
      .sortBy('setIndex')
    if (sets.length > 0) return { session, sets }
  }

  return null
}

export async function getPreviousExerciseSets(
  exerciseId: string,
  excludeSessionId: string,
): Promise<LoggedSet[]> {
  return (await getPreviousExerciseHistory(exerciseId, excludeSessionId))?.sets ?? []
}

/**
 * Everything the session screen needs for one date, in one read. Null when no
 * session exists for that date at all.
 */
/** One soreness prompt owed at the start of a session. */
export interface SorenessPromptState {
  muscleGroupId: string
  muscleGroupName: string
  answered: boolean
}

export interface SessionView {
  session: Session
  template: DayTemplate
  /** Ordered as the session runs. */
  exercises: ExerciseView[]
  /** Logged sets this session, keyed by exercise id, in set order. */
  setsByExercise: Record<string, LoggedSet[]>
  /** Last completed session's sets per exercise — the targets to beat. */
  previousByExercise: Record<string, LoggedSet[]>
  /** The engine's prescription per exercise, once soreness is answered. */
  prescriptionsByExercise: Record<string, Prescription>
  /** Pump/RIR/joint-pain already given this session, per exercise. */
  feedbackByExercise: Record<string, ExerciseFeedback>
  /** The day's soreness questions and which are still owed. Empty on deload. */
  sorenessPrompts: SorenessPromptState[]
}

export async function getSessionView(date: IsoDate): Promise<SessionView | null> {
  const session = await db.sessions.where('date').equals(date).first()
  if (!session) return null
  // `return await`, not `return`: handing the bare promise back exits this
  // async function before the helper's later reads run, and Dexie's liveQuery
  // dependency tracking dies at that boundary — the view then never refreshes
  // for tables read after the first few awaits. Found empirically; keep the
  // await.
  return await assembleSessionView(session)
}

/**
 * The in-progress session, wherever its date lies. This is what the session
 * screen follows: a workout that crosses midnight keeps its screen, and a
 * session left unfinished yesterday is still reachable to be completed —
 * keyed to the calendar it would simply vanish, stranding the logged work
 * forever. Null when nothing is in progress. Skipped and completed sessions
 * are never "active", so a stale tab on #/session goes home instead of
 * logging into them.
 */
export async function getActiveSessionView(): Promise<SessionView | null> {
  const inProgress = await db.sessions
    .where('status')
    .equals('in_progress')
    .toArray()
  const session = inProgress.sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!session) return null
  // See getSessionView: `return await` is load-bearing for live queries.
  return await assembleSessionView(session)
}

/**
 * Structured for live-query reactivity, and the shape is load-bearing: every
 * table read is launched *synchronously* inside a Promise.all batch, because
 * Dexie registers a query's dependency ranges when the query starts, and its
 * tracking context does not reliably survive long chains of sequential awaits
 * through nested helpers. The original sequential version silently stopped
 * reacting to writes on the later-read tables (prescriptions, feedback,
 * soreness) — found empirically when the soreness check-in froze on its first
 * question. Keep reads batched; do not "simplify" back to one-await-per-read.
 */
async function assembleSessionView(session: Session): Promise<SessionView | null> {
  const [template, sets, prescriptions, feedback, sorenessRows, allGroups, completedSessions] =
    await Promise.all([
      db.dayTemplates.get(session.dayTemplateId),
      db.sets.where('sessionId').equals(session.id).sortBy('setIndex'),
      db.prescriptions.where('sessionId').equals(session.id).toArray(),
      db.exerciseFeedback.where('sessionId').equals(session.id).toArray(),
      db.sorenessFeedback.where('sessionId').equals(session.id).toArray(),
      db.muscleGroups.toArray(),
      db.sessions.where('status').equals('completed').toArray(),
    ])
  if (!template) return null

  // Deloads excluded: the greyed target to beat is the last *working* session.
  const candidates = completedSessions
    .filter((s) => s.id !== session.id && !s.isDeload)
    .sort((a, b) => b.date.localeCompare(a.date))

  // Second batch: the reads that needed the template. The per-exercise
  // previous-session lookups start synchronously here too.
  const [exerciseRows, previousPerExercise] = await Promise.all([
    db.exercises.bulkGet([...template.exerciseIds]),
    Promise.all(
      template.exerciseIds.map(async (exerciseId) => {
        for (const candidate of candidates) {
          const previous = await db.sets
            .where('[sessionId+exerciseId]')
            .equals([candidate.id, exerciseId])
            .sortBy('setIndex')
          if (previous.length > 0) return previous
        }
        return []
      }),
    ),
  ])

  const groupNameById = new Map(allGroups.map((group) => [group.id, group.name]))
  const exercises: ExerciseView[] = []
  const previousByExercise: Record<string, LoggedSet[]> = {}
  for (const [index, row] of exerciseRows.entries()) {
    if (!row) continue // dangling id: exercise deleted while still templated
    exercises.push({
      ...row,
      muscleGroupName: groupNameById.get(row.muscleGroupId) ?? '',
    })
    previousByExercise[row.id] = previousPerExercise[index] ?? []
  }

  const setsByExercise: Record<string, LoggedSet[]> = {}
  for (const set of sets) {
    ;(setsByExercise[set.exerciseId] ??= []).push(set)
  }

  const prescriptionsByExercise: Record<string, Prescription> = {}
  for (const prescription of prescriptions) {
    prescriptionsByExercise[prescription.exerciseId] = prescription
  }

  const feedbackByExercise: Record<string, ExerciseFeedback> = {}
  for (const row of feedback) {
    feedbackByExercise[row.exerciseId] = row
  }

  // Deload sessions ask nothing (BRIEF Part 5).
  let sorenessPrompts: SorenessPromptState[] = []
  if (!session.isDeload) {
    const answered = new Set(sorenessRows.map((row) => row.muscleGroupId))
    sorenessPrompts = template.sorenessPromptGroupIds.flatMap((groupId) => {
      const name = groupNameById.get(groupId)
      if (name === undefined) return []
      return [{ muscleGroupId: groupId, muscleGroupName: name, answered: answered.has(groupId) }]
    })
  }

  return {
    session,
    template,
    exercises,
    setsByExercise,
    previousByExercise,
    prescriptionsByExercise,
    feedbackByExercise,
    sorenessPrompts,
  }
}

export async function getTodayView(date: IsoDate): Promise<TodayView> {
  const [templates, mesocycle, session, sessions, settings] = await Promise.all([
    getDayTemplates(),
    getActiveMesocycle(),
    getSessionForDate(date),
    db.sessions.toArray(),
    getSettings(),
  ])

  const unfinishedSession = sessions
    .filter((s) => s.status === 'in_progress' && s.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0]

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
    unfinishedSession,
    setsLoggedToday: session
      ? await db.sets.where('sessionId').equals(session.id).count()
      : 0,
    cardioMinutes: settings?.lastCardio.durationMin ?? DEFAULT_CARDIO.durationMin,
    streak: currentStreak(templates, sessions, date),
  }
}
