import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Button } from '../../components/Button'
import { Screen } from '../../components/Screen'
import { Stepper } from '../../components/Stepper'
import { FeedbackFlow } from './FeedbackFlow'
import { QuestionScreen } from './QuestionScreen'
import { RestTimer } from './RestTimer'
import {
  getActiveSessionView,
  getSettings,
  type ExerciseView,
  type SessionView,
} from '../../db/queries'
import {
  addPlannedSet,
  capPlannedSetsAtLogged,
  completeSession,
  generatePrescriptions,
  saveExerciseFeedback,
  saveSet,
  saveSorenessFeedback,
  setSessionPosition,
} from '../../db/mutations'
import type {
  CardioEntry,
  LoggedSet,
  Prescription,
  Soreness,
} from '../../db/schema'
import { navigate } from '../../lib/router'

interface RestState {
  endsAt: number
  totalSeconds: number
}

/**
 * The session flow (BRIEF Part 6): one exercise at a time, tapped through with
 * the arrows beside the primary action, steppers for weight and reps, a rest
 * timer that starts itself when a set is logged, and cardio as the final step
 * before completion.
 *
 * Everything rendered as "logged" comes from a live query over IndexedDB —
 * there is no optimistic set state anywhere, so what the screen shows saved
 * is what a killed tab will resume with (PLAN §2.1).
 */
export function SessionScreen() {
  // Follows the in-progress session wherever its date lies — a workout that
  // crosses midnight keeps its screen, and completing it makes this view null,
  // which is also what sends a stale tab home. Skipped and completed sessions
  // are never active, so nothing can log into them from here.
  const view = useLiveQuery(() => getActiveSessionView(), [])
  const [rest, setRest] = useState<RestState | null>(null)

  useEffect(() => {
    if (view === null) navigate('/today')
  }, [view])

  if (!view) return <Screen>{null}</Screen>

  return (
    <SessionBody
      key={view.session.id}
      view={view}
      rest={rest}
      onRest={setRest}
    />
  )
}

function SessionBody({
  view,
  rest,
  onRest,
}: {
  view: SessionView
  rest: RestState | null
  onRest: (rest: RestState | null) => void
}) {
  const { session, exercises } = view
  // The position is owned by the database so a killed app resumes in place;
  // local state only mirrors it for instant navigation.
  const [index, setIndex] = useState(session.currentExerciseIndex)
  /** The exercise owing pump/RIR answers, and where to go once given. */
  const [pendingFeedback, setPendingFeedback] = useState<{
    exerciseId: string
    thenGo: number | null
  } | null>(null)

  const clamped = Math.min(index, exercises.length)
  const onCardio = clamped >= exercises.length

  const unansweredSoreness = view.sorenessPrompts.filter((p) => !p.answered)
  const hasPrescriptions = Object.keys(view.prescriptionsByExercise).length > 0

  // Prescriptions follow the last soreness answer. This effect is the safety
  // net for the killed-in-between case: prompts all answered (or none exist,
  // as on a deload) but no plan stored yet. generatePrescriptions is
  // idempotent, so racing the answer handler is harmless.
  const generating = useRef(false)
  useEffect(() => {
    if (
      unansweredSoreness.length === 0 &&
      !hasPrescriptions &&
      exercises.length > 0 &&
      !generating.current
    ) {
      generating.current = true
      void generatePrescriptions(session.id).finally(() => {
        generating.current = false
      })
    }
  }, [unansweredSoreness.length, hasPrescriptions, exercises.length, session.id])

  /** Feedback owed for an exercise being left: sets logged, none given yet. */
  function feedbackOwedFor(exerciseIndex: number): string | null {
    if (session.isDeload) return null
    const exercise = exercises[exerciseIndex]
    if (!exercise) return null
    const logged = view.setsByExercise[exercise.id]?.length ?? 0
    if (logged === 0) return null
    if (view.feedbackByExercise[exercise.id]) return null
    return exercise.id
  }

  function go(next: number) {
    const target = Math.max(0, Math.min(next, exercises.length))
    // Leaving an exercise that has work but no feedback: ask first, moving on
    // after the answers. Moving backwards never triggers it — the exercise
    // may not be finished.
    if (target > clamped) {
      const owed = feedbackOwedFor(clamped)
      if (owed) {
        setPendingFeedback({ exerciseId: owed, thenGo: target })
        return
      }
    }
    setIndex(target)
    // Fire-and-forget: position is a convenience, never worth blocking a tap.
    void setSessionPosition(session.id, target)
  }

  /*
   * Swipe-between-exercises is gone (owner request): mid-set, a thumb resting
   * on the screen could move you off the exercise you were logging. The
   * arrows beside the primary action are the only way through, and they are
   * deliberate taps.
   */

  // The day's soreness questions come before any lifting (BRIEF Part 5).
  const firstUnanswered = unansweredSoreness[0]
  if (firstUnanswered) {
    const total = view.sorenessPrompts.length
    const answered = total - unansweredSoreness.length
    return (
      <QuestionScreen<Soreness>
        step={`Check-in · ${answered + 1} of ${total}`}
        question={`How sore is your ${firstUnanswered.muscleGroupName.toLowerCase()} from last time?`}
        options={[
          { value: 'none', label: 'Not sore' },
          { value: 'a_little', label: 'A little' },
          { value: 'still_sore', label: 'Still sore', alert: true },
        ]}
        onAnswer={(soreness) => {
          void (async () => {
            await saveSorenessFeedback(session.id, firstUnanswered.muscleGroupId, soreness)
            // The last answer unlocks the day's plan.
            if (unansweredSoreness.length === 1) {
              await generatePrescriptions(session.id)
            }
          })()
        }}
      />
    )
  }

  // Pump/RIR/joint pain for an exercise just finished.
  if (pendingFeedback) {
    const exercise = exercises.find((e) => e.id === pendingFeedback.exerciseId)
    return (
      <FeedbackFlow
        key={pendingFeedback.exerciseId}
        exerciseName={exercise?.name ?? 'Exercise'}
        sets={view.setsByExercise[pendingFeedback.exerciseId] ?? []}
        onComplete={(feedback) => {
          void (async () => {
            await saveExerciseFeedback(session.id, pendingFeedback.exerciseId, feedback)
            const target = pendingFeedback.thenGo
            setPendingFeedback(null)
            if (target !== null) {
              setIndex(target)
              void setSessionPosition(session.id, target)
            }
          })()
        }}
      />
    )
  }

  if (onCardio) {
    return (
      <CardioPane
        sessionId={session.id}
        onBack={() => go(exercises.length - 1)}
      />
    )
  }

  const exercise = exercises[clamped]
  if (!exercise) return <Screen>{null}</Screen>

  const prescription = view.prescriptionsByExercise[exercise.id]
  return (
    <ExercisePane
      key={exercise.id}
      exercise={exercise}
      prescription={prescription}
      position={clamped}
      total={exercises.length}
      sets={view.setsByExercise[exercise.id] ?? []}
      previous={view.previousByExercise[exercise.id] ?? []}
      sessionId={session.id}
      rest={rest}
      onRest={onRest}
      onLoggedLastPlannedSet={() => {
        // Called straight after a saveSet, so don't rely on the live query
        // having refreshed — the set that triggered this is proof of work.
        if (!session.isDeload && !view.feedbackByExercise[exercise.id]) {
          setPendingFeedback({ exerciseId: exercise.id, thenGo: null })
        }
      }}
      onPrev={clamped > 0 ? () => go(clamped - 1) : null}
      onNext={() => go(clamped + 1)}
      isLast={clamped === exercises.length - 1}
    />
  )
}

function ExercisePane({
  exercise,
  prescription,
  position,
  total,
  sets,
  previous,
  sessionId,
  rest,
  onRest,
  onLoggedLastPlannedSet,
  onPrev,
  onNext,
  isLast,
}: {
  exercise: ExerciseView
  prescription: Prescription | undefined
  position: number
  total: number
  sets: LoggedSet[]
  previous: LoggedSet[]
  sessionId: string
  rest: RestState | null
  onRest: (rest: RestState | null) => void
  onLoggedLastPlannedSet: () => void
  onPrev: (() => void) | null
  onNext: () => void
  isLast: boolean
}) {
  const nextSetIndex = sets.length
  const lastLogged = sets[sets.length - 1]
  const prevForNext = previous[nextSetIndex]
  /** Every planned set is in the book (and nothing is mid-correction). */
  const planDone =
    prescription !== undefined && nextSetIndex >= prescription.plannedSets

  // Starting numbers, best signal first: the set just done, then the engine's
  // prescription, then last session, then the rep floor.
  const [weight, setWeight] = useState(
    () =>
      lastLogged?.weightLb ??
      prescription?.plannedWeightLb ??
      prevForNext?.weightLb ??
      previous[0]?.weightLb ??
      0,
  )
  const [reps, setReps] = useState(
    () =>
      lastLogged?.reps ??
      prevForNext?.reps ??
      previous[0]?.reps ??
      exercise.repTargetMin,
  )
  const [saving, setSaving] = useState(false)
  /** True once the user has adjusted a stepper — their number then wins. */
  const [touched, setTouched] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  /**
   * A logged set being corrected: tapping its row loads it into the steppers,
   * stashing the in-progress next-set draft to restore afterwards. Tapping
   * the same row again cancels.
   */
  const [editing, setEditing] = useState<{
    index: number
    stashWeight: number
    stashReps: number
  } | null>(null)

  function beginOrToggleEdit(setIndex: number, logged: LoggedSet) {
    if (editing?.index === setIndex) {
      cancelEdit()
      return
    }
    setEditing((current) => ({
      index: setIndex,
      // The stash is the next-set draft, taken once — switching between rows
      // mid-edit keeps the original draft to come back to.
      stashWeight: current?.stashWeight ?? weight,
      stashReps: current?.stashReps ?? reps,
    }))
    setWeight(logged.weightLb)
    setReps(logged.reps)
    setTouched(true)
  }

  function cancelEdit() {
    if (!editing) return
    setWeight(editing.stashWeight)
    setReps(editing.stashReps)
    setEditing(null)
  }

  // The prescription can arrive *after* this pane mounts: the safety-net
  // regeneration after a kill, or simply a slow device refreshing between the
  // soreness commit and the prescriptions commit. The mount-time default then
  // came from last session, and without this the stepper would sit on 185
  // directly under a sentence saying "add 5 lb". Re-seed as long as nothing
  // has been logged and the user hasn't touched the stepper themselves.
  const plannedWeight = prescription?.plannedWeightLb ?? null
  useEffect(() => {
    if (touched || sets.length > 0 || plannedWeight === null) return
    setWeight(plannedWeight)
  }, [plannedWeight, touched, sets.length])

  async function logSet() {
    if (saving || weight <= 0 || reps <= 0) return
    setSaving(true)
    try {
      // Correcting an existing set: same durable write, aimed at that row's
      // index — saveSet overwrites by index rather than duplicating. No rest
      // timer and no feedback prompt; a correction is not a new set.
      if (editing) {
        await saveSet({
          sessionId,
          exerciseId: exercise.id,
          setIndex: editing.index,
          weightLb: weight,
          reps,
        })
        cancelEdit()
        return
      }

      // The write starts on the tap and the row below only appears once the
      // transaction has committed and the live query refreshes.
      await saveSet({
        sessionId,
        exerciseId: exercise.id,
        setIndex: nextSetIndex,
        weightLb: weight,
        reps,
        prescribedWeightLb: prescription?.plannedWeightLb ?? null,
        prescribedReps: prescription?.minRepsToBeat ?? null,
      })
      onRest({
        endsAt: Date.now() + exercise.restSeconds * 1000,
        totalSeconds: exercise.restSeconds,
      })
      // The last planned set triggers the feedback questions (BRIEF Part 5).
      if (prescription && nextSetIndex + 1 >= prescription.plannedSets) {
        onLoggedLastPlannedSet()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      action={
        /*
         * Exercise navigation flanks the primary action rather than sitting
         * at the end of the scroll content, where it was below the fold on
         * every phone — you had to scroll past the steppers to change
         * exercise, mid-workout. Flanking costs no vertical space at all:
         * the arrows are the same height as the button they sit beside.
         */
        <div className="flex items-stretch gap-2">
          {/* "Go to …" rather than "Previous/Next exercise", so an arrow's
              accessible name can never be confused with the primary button's
              own "Next exercise ›" label. */}
          <NavArrow
            label="Go to previous exercise"
            glyph="‹"
            onClick={onPrev ?? undefined}
            disabled={!onPrev}
          />
          <div className="min-w-0 flex-1">
            {planDone && !editing ? (
              // The plan is complete: the honest action is moving on, not a
              // silent invitation to a set nobody prescribed. Bonus sets are a
              // deliberate "Add a set" in the ⋯ menu.
              <Button onClick={onNext}>
                {isLast ? 'Cardio ›' : 'Next exercise ›'}
              </Button>
            ) : (
              <Button
                onClick={() => void logSet()}
                disabled={saving || weight <= 0 || reps <= 0}
              >
                {saving
                  ? 'Saving…'
                  : // A first-ever exercise starts at 0 lb, so the hero button
                    // would otherwise render as a dimmed red slab before you
                    // have done anything wrong. Say what is missing instead.
                    weight <= 0
                    ? 'Set a weight'
                    : editing
                      ? `Save set ${editing.index + 1}`
                      : prescription
                        ? `Log set ${nextSetIndex + 1} of ${prescription.plannedSets}`
                        : `Log set ${nextSetIndex + 1}`}
              </Button>
            )}
          </div>
          <NavArrow
            label={isLast ? 'Go to cardio' : 'Go to next exercise'}
            glyph="›"
            onClick={onNext}
          />
        </div>
      }
    >
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between gap-4">
          <p className="text-xs tracking-wider text-text-secondary uppercase">
            Exercise <span className="num text-text">{position + 1}</span> of{' '}
            <span className="num text-text">{total}</span>
          </p>
          <div className="flex items-center gap-3">
            <p className="shrink-0 text-xs tracking-wider text-text-secondary uppercase">
              {exercise.muscleGroupName}
            </p>
            {prescription ? (
              <button
                type="button"
                aria-label="Exercise options"
                onClick={() => setMenuOpen(!menuOpen)}
                className="num min-h-touch-min min-w-touch-min rounded-md border border-border bg-surface-raised text-base text-text-secondary"
              >
                ⋯
              </button>
            ) : null}
          </div>
        </header>

        {/* The per-exercise menu (product owner request): deliberate set
            adjustments live here rather than the app silently inviting a
            "Log set 4" after a 3-set plan. */}
        {menuOpen && prescription ? (
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40"
            />
            <div
              className="fixed right-6 z-50 flex w-56 flex-col rounded-md border border-border-strong bg-surface-raised shadow-soft"
              style={{ top: 'calc(var(--safe-top) + var(--spacing-16))' }}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void addPlannedSet(sessionId, exercise.id)
                }}
                className="min-h-touch-comfortable px-4 text-left text-sm text-text"
              >
                Add a set
              </button>
              <button
                type="button"
                disabled={sets.length >= prescription.plannedSets && sets.length > 0}
                onClick={() => {
                  setMenuOpen(false)
                  void capPlannedSetsAtLogged(sessionId, exercise.id).then(onNext)
                }}
                className="min-h-touch-comfortable border-t border-border px-4 text-left text-sm text-text disabled:text-text-muted"
              >
                {sets.length === 0 ? 'Skip exercise' : 'Skip remaining sets'}
              </button>
            </div>
          </>
        ) : null}

        <h1 className="mt-4 text-lg leading-snug text-balance text-text">
          {exercise.name}
        </h1>
        {/* Set count is visible from the pills below and rest time from the
            timer itself, so the meta line is down to the rep target. */}
        <p className="mt-1 text-xs tracking-wider text-text-secondary uppercase">
          <span className="num">
            {exercise.repTargetMin}–{exercise.repTargetMax}
          </span>{' '}
          reps
        </p>

        {/* The engine explains itself in one sentence (BRIEF Part 5). */}
        {prescription ? (
          <div className="mt-4 rounded-md border border-border bg-surface px-4 py-2">
            <p className="text-sm leading-snug text-text">{prescription.sentence}</p>
          </div>
        ) : null}

        {/*
         * The day's sets as one row of pills rather than a stacked list. Five
         * full-width rows cost ~250px and pushed the steppers and the action
         * button off the screen; this is ~50px and shows the whole exercise at
         * a glance, which is what the owner asked for. A logged pill reads
         * bright; one still to come shows last session's number to beat in
         * grey. Tapping a logged pill loads it for correction, exactly as the
         * rows did.
         */}
        {sets.length > 0 || previous.length > 0 || prescription ? (
          <ul className="mt-5 flex gap-2">
            {Array.from(
              {
                length: Math.max(
                  sets.length,
                  previous.length,
                  prescription?.plannedSets ?? 0,
                ),
              },
              (_, setIndex) => {
                const logged = sets[setIndex]
                const target = previous[setIndex]
                const isEditing = editing?.index === setIndex
                const shown = logged ?? target
                const pill = (
                  <>
                    <span className="num block text-micro text-text-muted">
                      {setIndex + 1}
                    </span>
                    {shown ? (
                      <>
                        <span
                          className={`num block text-sm leading-tight ${
                            logged ? 'text-text' : 'text-text-muted'
                          }`}
                        >
                          {shown.weightLb}
                        </span>
                        <span
                          className={`num block text-micro leading-tight ${
                            logged ? 'text-text-secondary' : 'text-text-muted'
                          }`}
                        >
                          ×{shown.reps}
                        </span>
                      </>
                    ) : (
                      <span className="num block text-sm leading-tight text-text-faint">
                        —
                      </span>
                    )}
                  </>
                )
                return (
                  <li key={setIndex} className="min-w-0 flex-1">
                    {logged ? (
                      <button
                        type="button"
                        aria-label={`Edit set ${setIndex + 1}: ${logged.weightLb} × ${logged.reps}`}
                        onClick={() => beginOrToggleEdit(setIndex, logged)}
                        className={`min-h-touch-min w-full rounded-md border px-1 py-1.5 ${
                          isEditing
                            ? 'border-border-strong bg-surface-raised'
                            : 'border-border bg-surface'
                        }`}
                      >
                        {pill}
                      </button>
                    ) : (
                      <div
                        aria-label={
                          target
                            ? `Set ${setIndex + 1} to come, last time ${target.weightLb} × ${target.reps}`
                            : `Set ${setIndex + 1} to come`
                        }
                        className="min-h-touch-min rounded-md border border-border bg-surface px-1 py-1.5"
                      >
                        {pill}
                      </div>
                    )}
                  </li>
                )
              },
            )}
          </ul>
        ) : null}

        {editing ? (
          <p className="mt-3 text-xs tracking-wider text-text-secondary uppercase">
            Editing set <span className="num text-text">{editing.index + 1}</span>
            <span className="mx-2 text-text-faint">·</span>
            tap it again to cancel
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs tracking-wider text-text-secondary uppercase">
              Weight
            </p>
            <Stepper
              label="Weight"
              value={weight}
              step={exercise.weightIncrementLb}
              unit="lb"
              // A first-ever exercise has no weight to prescribe, so the
              // stepper is what needs attention — marked with a border rather
              // than a glow, which would breach Part 7's two-per-screen cap.
              highlight={weight <= 0}
              onChange={(next) => {
                setTouched(true)
                setWeight(next)
              }}
            />
          </div>
          <div>
            <p className="mb-2 text-xs tracking-wider text-text-secondary uppercase">
              Reps
            </p>
            <Stepper
              label="Reps"
              value={reps}
              step={1}
              onChange={(next) => {
                setTouched(true)
                setReps(next)
              }}
            />
          </div>
        </div>

      </div>

      {rest ? (
        <RestTimer
          endsAt={rest.endsAt}
          totalSeconds={rest.totalSeconds}
          onDismiss={() => onRest(null)}
        />
      ) : null}
    </Screen>
  )
}

/**
 * A quiet square that steps between exercises, sized to stand beside the
 * primary action without competing with it.
 */
function NavArrow({
  label,
  glyph,
  onClick,
  disabled = false,
}: {
  label: string
  glyph: string
  onClick: (() => void) | undefined
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      // Text face, not the numeric one: Space Grotesk draws ‹ › as bare angle
      // brackets at this size.
      className="min-h-control min-w-touch-comfortable shrink-0 rounded-xl border border-border bg-surface-raised text-xl text-text-secondary active:bg-surface disabled:opacity-30"
    >
      {glyph}
    </button>
  )
}

function CardioPane({
  sessionId,
  onBack,
}: {
  sessionId: string
  onBack: () => void
}) {
  const defaults = useLiveQuery(
    async () => (await getSettings())?.lastCardio ?? null,
    [],
  )

  if (defaults === undefined) return <Screen>{null}</Screen>
  return (
    <CardioForm
      sessionId={sessionId}
      initial={defaults ?? { durationMin: 45, inclinePct: 10, speedMph: 3 }}
      onBack={onBack}
    />
  )
}

function CardioForm({
  sessionId,
  initial,
  onBack,
}: {
  sessionId: string
  initial: CardioEntry
  onBack: () => void
}) {
  // Pre-filled with 45 min and last session's settings: confirming is one tap
  // (BRIEF Part 6).
  const [duration, setDuration] = useState(initial.durationMin)
  const [incline, setIncline] = useState(initial.inclinePct)
  const [speed, setSpeed] = useState(initial.speedMph)
  const [saving, setSaving] = useState(false)

  async function finish() {
    if (saving) return
    setSaving(true)
    try {
      await completeSession(sessionId, {
        durationMin: duration,
        inclinePct: incline,
        speedMph: speed,
      })
      navigate('/today')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      action={
        <Button onClick={() => void finish()} disabled={saving}>
          {saving ? 'Saving…' : 'Finish session'}
        </Button>
      }
    >
      <header className="flex items-baseline justify-between gap-4">
        <p className="text-xs tracking-wider text-text-secondary uppercase">Cardio</p>
      </header>

      <h1 className="mt-6 text-xl text-text">Incline walk</h1>
      <p className="mt-2 max-w-measure-base text-sm text-text-secondary">
        Pre-filled from last time. Adjust if today was different.
      </p>

      <div className="mt-10 flex flex-col gap-6">
        <div>
          <p className="mb-2 text-xs tracking-wider text-text-secondary uppercase">
            Duration
          </p>
          <Stepper label="Duration" value={duration} step={5} min={5} unit="min" onChange={setDuration} />
        </div>
        <div>
          <p className="mb-2 text-xs tracking-wider text-text-secondary uppercase">
            Incline
          </p>
          <Stepper label="Incline" value={incline} step={1} unit="%" onChange={setIncline} />
        </div>
        <div>
          <p className="mb-2 text-xs tracking-wider text-text-secondary uppercase">
            Speed
          </p>
          <Stepper label="Speed" value={speed} step={0.5} min={0.5} unit="mph" onChange={setSpeed} />
        </div>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-10 min-h-touch-min rounded-md border border-border bg-surface-raised px-4 text-sm text-text-secondary"
      >
        ‹ Back to exercises
      </button>
    </Screen>
  )
}
