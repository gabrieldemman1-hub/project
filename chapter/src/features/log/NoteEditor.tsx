import type { ChangeEvent } from 'react'

/**
 * A plain textarea, deliberately.
 *
 * Plain means the iOS keyboard's own dictation mic works with zero code — tap
 * the field, tap the mic, talk. That is on-device, works offline, works in an
 * installed PWA, and cannot be broken by a Safari update, which is more than
 * can be said for the Web Speech API. Real transcription arrives in Phase 4 as
 * a second door, never as a replacement for typing.
 */
export function NoteEditor({
  value,
  onChange,
  placeholder = 'What was the most important idea in this chapter? Your own words.',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={7}
        className="serif w-full p-4 rounded-[var(--radius-md)] bg-surface border border-border-soft
          text-[1.05rem] leading-[1.65] text-ink placeholder:text-ink-faint resize-y"
      />
      <p className="text-xs text-ink-faint mt-1.5">
        Tap the mic on your keyboard to speak it instead.
      </p>
    </div>
  )
}
