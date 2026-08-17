import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Button } from '../../components/Button'
import { Screen } from '../../components/Screen'
import {
  addExerciseToDay,
  addExerciseToLibrary,
  clearAppLock,
  moveExerciseInDay,
  removeExerciseFromDay,
  setAppLock,
  setTheme,
  startNewMesocycle,
} from '../../db/mutations'
import { getSettingsView, type SettingsView } from '../../db/queries'
import type { DayTemplate, Theme } from '../../db/schema'
import { createLock, isValidPin, verifyPin } from '../../lib/pin'
import { formatLongDate } from '../../lib/date'
import { navigate } from '../../lib/router'
import { APP_VERSION } from '../../lib/version'

/**
 * Settings (BRIEF Part 6, arriving early at the owner's request): edit each
 * day's exercise list, grow the library, see every saved block, switch
 * theme, and manage the on-device PIN lock. Export/import lands with the
 * rest of Phase 7.
 */
export function SettingsScreen() {
  const view = useLiveQuery(() => getSettingsView(), [])
  if (!view) return <Screen>{null}</Screen>

  return (
    <Screen
      action={
        <Button variant="quiet" onClick={() => navigate('/')}>
          ‹ Home
        </Button>
      }
    >
      <p className="text-xs tracking-wider text-text-secondary uppercase">Settings</p>

      <Section title="Days">
        {view.templates.map((template) => (
          <DayEditor key={template.id} template={template} view={view} />
        ))}
      </Section>

      <Section title="Exercise library">
        <LibraryList view={view} />
        <AddExerciseForm view={view} />
      </Section>

      <Section title="Blocks">
        <BlocksList view={view} />
      </Section>

      <Section title="Appearance">
        <ThemeToggle current={view.settings?.theme ?? 'dark'} />
      </Section>

      <Section title="App lock">
        <LockManager view={view} />
      </Section>

      <p className="mt-10 text-micro tracking-wider text-text-muted uppercase">
        {APP_VERSION}
      </p>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs tracking-wider text-text-secondary uppercase">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  )
}

function DayEditor({ template, view }: { template: DayTemplate; view: SettingsView }) {
  const [adding, setAdding] = useState('')
  const inDay = template.exerciseIds
  const nameById = new Map(view.exercises.map((e) => [e.id, e.name]))
  const addable = view.exercises.filter((e) => !inDay.includes(e.id) && !e.isArchived)

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      <p className="text-sm text-text">
        <span className="num font-bold">{template.letter}</span>
        <span className="mx-2 text-text-muted">·</span>
        {template.name}
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {inDay.map((exerciseId, index) => (
          <li key={exerciseId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
              {nameById.get(exerciseId) ?? '—'}
            </span>
            <button
              type="button"
              aria-label={`Move ${nameById.get(exerciseId)} up in day ${template.letter}`}
              disabled={index === 0}
              onClick={() => void moveExerciseInDay(template.id, exerciseId, 'up')}
              className="num min-h-touch-min min-w-touch-min rounded-md border border-border bg-surface-raised text-sm text-text-secondary disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${nameById.get(exerciseId)} down in day ${template.letter}`}
              disabled={index === inDay.length - 1}
              onClick={() => void moveExerciseInDay(template.id, exerciseId, 'down')}
              className="num min-h-touch-min min-w-touch-min rounded-md border border-border bg-surface-raised text-sm text-text-secondary disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove ${nameById.get(exerciseId)} from day ${template.letter}`}
              onClick={() => void removeExerciseFromDay(template.id, exerciseId)}
              className="min-h-touch-min min-w-touch-min rounded-md border border-border bg-surface-raised text-sm text-alert"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <select
          aria-label={`Add exercise to day ${template.letter}`}
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          className="min-h-touch-min min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2 text-sm text-text"
        >
          <option value="">Add an exercise…</option>
          {addable.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Add selected exercise to day ${template.letter}`}
          disabled={adding === ''}
          onClick={() => {
            void addExerciseToDay(template.id, adding)
            setAdding('')
          }}
          className="min-h-touch-min rounded-md border border-border bg-surface-raised px-4 text-sm text-text disabled:opacity-30"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function LibraryList({ view }: { view: SettingsView }) {
  return (
    <ul className="flex flex-col gap-2">
      {view.exercises.map((exercise) => (
        <li
          key={exercise.id}
          className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3"
        >
          <span className="min-w-0 flex-1 text-sm text-text">{exercise.name}</span>
          <span className="shrink-0 text-micro tracking-wider text-text-secondary uppercase">
            {exercise.muscleGroupName}
            <span className="mx-1 text-text-muted">·</span>
            <span className="num">
              {exercise.repTargetMin}–{exercise.repTargetMax}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function AddExerciseForm({ view }: { view: SettingsView }) {
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [type, setType] = useState<'compound' | 'isolation'>('isolation')
  const [error, setError] = useState('')

  async function submit() {
    try {
      setError('')
      const isolation = type === 'isolation'
      await addExerciseToLibrary({
        name,
        type,
        muscleGroupId: groupId,
        repTargetMin: isolation ? 10 : 8,
        repTargetMax: isolation ? 15 : 12,
      })
      setName('')
      setGroupId('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      <p className="text-xs tracking-wider text-text-secondary uppercase">
        New exercise
      </p>
      <input
        aria-label="New exercise name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        className="mt-3 min-h-touch-min w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text placeholder:text-text-muted"
      />
      <div className="mt-2 flex gap-2">
        <select
          aria-label="New exercise muscle group"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          className="min-h-touch-min min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2 text-sm text-text"
        >
          <option value="">Muscle group…</option>
          {view.muscleGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <select
          aria-label="New exercise type"
          value={type}
          onChange={(event) => setType(event.target.value as 'compound' | 'isolation')}
          className="min-h-touch-min rounded-md border border-border bg-surface-raised px-2 text-sm text-text"
        >
          <option value="isolation">Isolation</option>
          <option value="compound">Compound</option>
        </select>
      </div>
      {error ? <p className="mt-2 text-xs text-alert">{error}</p> : null}
      <button
        type="button"
        disabled={name.trim() === '' || groupId === ''}
        onClick={() => void submit()}
        className="mt-3 min-h-touch-min w-full rounded-md border border-border bg-surface-raised text-sm text-text disabled:opacity-30"
      >
        Save to library
      </button>
    </div>
  )
}

function BlocksList({ view }: { view: SettingsView }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <ul className="flex flex-col gap-2">
        {view.mesocycles.map((mesocycle) => (
          <li
            key={mesocycle.id}
            className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3"
          >
            <span className="text-sm text-text">
              {formatLongDate(mesocycle.startDate)}
            </span>
            <span className="shrink-0 text-micro tracking-wider text-text-secondary uppercase">
              {mesocycle.status === 'active' ? 'Current' : 'Saved'}
              <span className="mx-1 text-text-muted">·</span>
              <span className="num">{mesocycle.sessionCount}</span> sessions
            </span>
          </li>
        ))}
      </ul>
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              void startNewMesocycle()
            }}
            className="min-h-touch-min flex-1 rounded-md border border-border-strong bg-surface-raised text-sm text-text"
          >
            Confirm — start week 1 today
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-touch-min rounded-md border border-border bg-surface px-4 text-sm text-text-secondary"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-touch-min rounded-md border border-border bg-surface-raised text-sm text-text"
        >
          Start a new block now
        </button>
      )}
    </>
  )
}

function ThemeToggle({ current }: { current: Theme }) {
  return (
    <div className="flex gap-2">
      {(['dark', 'light'] as const).map((theme) => (
        <button
          key={theme}
          type="button"
          onClick={() => void setTheme(theme)}
          className={`min-h-touch-min flex-1 rounded-md border text-sm capitalize ${
            current === theme
              ? 'border-border-strong bg-surface-raised text-text'
              : 'border-border bg-surface text-text-secondary'
          }`}
        >
          {theme}
        </button>
      ))}
    </div>
  )
}

function LockManager({ view }: { view: SettingsView }) {
  const lock = view.settings?.appLock ?? null
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [current, setCurrent] = useState('')
  const [hint, setHint] = useState('')
  const [message, setMessage] = useState('')

  const field =
    'min-h-touch-min w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text placeholder:text-text-muted'

  async function install() {
    setMessage('')
    if (!isValidPin(pin)) return setMessage('PIN must be 4–8 digits.')
    if (pin !== confirm) return setMessage('PINs do not match.')
    // The session that creates the lock is already trusted — without this,
    // the gate would slam shut the instant the lock lands in the database.
    sessionStorage.setItem('workout-unlocked', '1')
    await setAppLock(await createLock(pin, hint.trim()))
    setPin('')
    setConfirm('')
    setHint('')
    setMessage('Lock is on. It applies from the next time the app opens.')
  }

  async function remove() {
    setMessage('')
    if (!lock) return
    if (!(await verifyPin(lock, current))) return setMessage('Wrong PIN.')
    await clearAppLock()
    setCurrent('')
    setMessage('Lock removed.')
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      {lock ? (
        <>
          <p className="text-sm text-text">A PIN currently protects this app.</p>
          <input
            aria-label="Current PIN"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            inputMode="numeric"
            type="password"
            placeholder="Current PIN"
            className={`mt-3 ${field}`}
          />
          <button
            type="button"
            onClick={() => void remove()}
            className="mt-2 min-h-touch-min w-full rounded-md border border-border bg-surface-raised text-sm text-alert"
          >
            Remove lock
          </button>
        </>
      ) : (
        <>
          <p className="max-w-measure-wide text-sm leading-relaxed text-text-secondary">
            A 4–8 digit PIN, stored scrambled on this phone only. It deters
            someone picking up your phone — it is not bank-grade security, and
            if you forget it without a hint there is no recovery.
          </p>
          <input
            aria-label="New PIN"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            inputMode="numeric"
            type="password"
            placeholder="New PIN"
            className={`mt-3 ${field}`}
          />
          <input
            aria-label="Confirm PIN"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            inputMode="numeric"
            type="password"
            placeholder="Confirm PIN"
            className={`mt-2 ${field}`}
          />
          <input
            aria-label="PIN hint"
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="Hint (optional, shown on request)"
            className={`mt-2 ${field}`}
          />
          <button
            type="button"
            onClick={() => void install()}
            disabled={pin === ''}
            className="mt-3 min-h-touch-min w-full rounded-md border border-border bg-surface-raised text-sm text-text disabled:opacity-30"
          >
            Set PIN
          </button>
        </>
      )}
      {message ? <p className="mt-2 text-xs text-text-secondary">{message}</p> : null}
    </div>
  )
}
