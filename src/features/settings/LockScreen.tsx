import { useState } from 'react'

import { Button } from '../../components/Button'
import { Screen } from '../../components/Screen'
import type { AppLock } from '../../db/schema'
import { verifyPin } from '../../lib/pin'

/**
 * The gate shown on open when a PIN is set. Unlocking lasts for the browser
 * session, so mid-workout backgrounding never re-asks — only a fresh open
 * does. The hint the user wrote for themselves is one tap away.
 */
export function LockScreen({ lock, onUnlock }: { lock: AppLock; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [showHint, setShowHint] = useState(false)

  async function attempt() {
    if (await verifyPin(lock, pin)) {
      onUnlock()
    } else {
      setWrong(true)
      setPin('')
    }
  }

  return (
    <Screen
      action={
        <Button onClick={() => void attempt()} disabled={pin.length < 4}>
          Unlock
        </Button>
      }
    >
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-xs tracking-wider text-text-secondary uppercase">Locked</p>
        <p className="mt-4 text-2xl text-text">Enter your PIN</p>

        <input
          aria-label="PIN"
          autoFocus
          value={pin}
          onChange={(event) => {
            setWrong(false)
            setPin(event.target.value.replace(/\D/g, '').slice(0, 8))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && pin.length >= 4) void attempt()
          }}
          inputMode="numeric"
          type="password"
          className="num mt-8 min-h-control w-full rounded-md border border-border-strong bg-surface text-center text-3xl tracking-wider text-text outline-none"
        />

        {wrong ? <p className="mt-3 text-sm text-alert">Wrong PIN.</p> : null}

        {lock.hint ? (
          showHint ? (
            <p className="mt-6 text-sm text-text-secondary">Hint: {lock.hint}</p>
          ) : (
            <button
              type="button"
              onClick={() => setShowHint(true)}
              className="mt-6 min-h-touch-min self-start rounded-md text-xs tracking-wider text-text-muted uppercase"
            >
              Show hint
            </button>
          )
        ) : null}
      </div>
    </Screen>
  )
}
