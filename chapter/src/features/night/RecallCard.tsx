import type { Note } from '../../db/schema'
import { shortDate } from '../../lib/format'

/**
 * THE critical interaction.
 *
 * While hidden, the note body is NOT RENDERED — not display:none, not
 * opacity:0, not a blur filter. It is not in the DOM at all. Anything less is
 * defeated by a screenshot, a text search, an accidental select-all, or a
 * moment of weakness, and showing the note before recall turns the entire app
 * into rereading, which is the one thing it exists not to be.
 *
 * prove-phase3 asserts the body string is absent from the rendered document
 * before the reveal tap and present after it.
 */
export function RecallCard({
  note,
  bookTitle,
  revealed,
  onReveal,
}: {
  note: Note
  bookTitle: string
  revealed: boolean
  onReveal: () => void
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="text-center pt-6">
        <p className="text-sm text-ink-quiet">{bookTitle}</p>
        <p className="text-xl font-medium mt-1.5">{note.chapterLabel}</p>
        <p className="text-xs text-ink-faint mt-1.5">Written {shortDate(note.createdAt)}</p>
      </div>

      {revealed ? (
        <div className="flex-1 flex items-center">
          <p
            data-testid="note-body"
            className="serif text-[1.15rem] leading-[1.7] text-ink select-text"
          >
            {note.body}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onReveal}
          data-testid="reveal"
          className="flex-1 w-full flex flex-col items-center justify-center gap-6 text-center select-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <span className="serif text-[1.15rem] leading-[1.7] text-ink-quiet max-w-[18rem]">
            Say the idea from this chapter out loud, in your own words.
          </span>
          <span className="text-sm text-accent-ink underline underline-offset-8 decoration-1">
            Then tap to reveal
          </span>
        </button>
      )}
    </div>
  )
}
