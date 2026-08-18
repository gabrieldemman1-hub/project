import { useEffect, useRef, useState } from 'react'
import { Screen } from '../../components/Screen'
import { Button } from '../../components/Button'
import { Field, FieldGroup, TextInput } from '../../components/Field'
import { Celebration } from '../../components/Celebration'
import { Cover } from '../../components/Cover'
import { NoteEditor } from './NoteEditor'
import { PositionInput } from './PositionInput'
import { useLive } from '../../lib/useLive'
import { allBooks, todaysBook } from '../../db/queries'
import { logChapter } from '../../db/mutations'
import { hrefFor, navigate } from '../../lib/router'
import { clearDraft, readDraft, writeDraft } from '../../lib/draft'
import type { Book } from '../../db/schema'

export function LogChapterScreen({ bookId }: { bookId: string | null }) {
  const books = useLive(() => allBooks(), [])
  const preferred = useLive(() => todaysBook(), [])

  const [selectedId, setSelectedId] = useState<string | null>(bookId)
  const [chapterLabel, setChapterLabel] = useState('')
  const [position, setPosition] = useState<number | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<{ from: number; to: number; title: string } | null>(null)
  const [restored, setRestored] = useState(false)
  const draftLoaded = useRef(false)

  // Restore an unfinished note before anything else touches the fields. iOS
  // relaunches a discarded app cold, so this is a normal path, not an edge case.
  useEffect(() => {
    if (draftLoaded.current) return
    draftLoaded.current = true
    const draft = readDraft()
    if (!draft) return
    if (bookId !== null && draft.bookId !== bookId) return
    setSelectedId(draft.bookId)
    setChapterLabel(draft.chapterLabel)
    setBody(draft.body)
    if (draft.position !== null) setPosition(draft.position)
    setRestored(true)
  }, [bookId])

  // Default to the pinned book when arriving without one.
  useEffect(() => {
    if (selectedId === null && preferred) setSelectedId(preferred.id)
  }, [selectedId, preferred])

  const book: Book | undefined = books?.find((b) => b.id === selectedId)

  useEffect(() => {
    if (!selectedId) return
    writeDraft({ bookId: selectedId, chapterLabel, position, body })
  }, [selectedId, chapterLabel, position, body])

  useEffect(() => {
    const flush = () => {
      if (selectedId) writeDraft({ bookId: selectedId, chapterLabel, position, body })
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [selectedId, chapterLabel, position, body])

  // Start the stepper where the book already is, so a normal session is a few taps.
  useEffect(() => {
    if (!book) return
    if (restored) return
    setPosition(book.progressUnit === 'percent' ? book.percentComplete : (book.currentPage ?? 0))
  }, [book?.id, book?.progressUnit, restored])

  async function save() {
    if (!book || position === null) return
    setError(null)
    setSaving(true)
    try {
      const result = await logChapter({
        bookId: book.id,
        chapterLabel,
        position,
        body,
      })
      clearDraft()
      setCelebrate({
        from: result.percentBefore,
        to: result.percentAfter,
        title: 'Chapter logged',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = Boolean(book) && position !== null && body.trim().length > 0

  return (
    <Screen
      title="Log a chapter"
      back={{ label: 'Back', href: hrefFor({ name: 'home' }) }}
      stickyFooter={false}
      footer={
        <div>
          {error && <p className="text-sm text-warn mb-2">{error}</p>}
          <Button full onClick={save} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save chapter'}
          </Button>
          {!canSave && !saving && (
            <p className="text-xs text-ink-faint text-center mt-2">
              A note is required — writing it in your own words is the point.
            </p>
          )}
        </div>
      }
    >
      {restored && (
        <p className="mt-2 mb-4 p-3 rounded-[var(--radius-md)] bg-accent-soft text-sm text-ink">
          Picked up where you left off — your unfinished note was saved.
        </p>
      )}

      <div className="space-y-5 mt-2">
        <FieldGroup label="Book">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5">
            {books?.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                aria-pressed={b.id === selectedId}
                className={`shrink-0 w-[4.5rem] text-left ${
                  b.id === selectedId ? 'opacity-100' : 'opacity-60'
                }`}
              >
                <Cover
                  book={b}
                  className={`w-[4.5rem] h-[6.75rem] [container-type:inline-size] ${
                    b.id === selectedId ? 'ring-2 ring-accent' : ''
                  }`}
                />
                <span className="block text-[0.6875rem] leading-tight mt-1 line-clamp-2 text-ink-quiet">
                  {b.title}
                </span>
              </button>
            ))}
          </div>
        </FieldGroup>

        {book && (
          <>
            <Field label="Chapter" hint="Whatever you'd call it — “Chapter 7”, “Part 2”, a title.">
              <TextInput
                value={chapterLabel}
                placeholder="Chapter"
                onChange={(e) => setChapterLabel(e.target.value)}
              />
            </Field>

            {position !== null && (
              <PositionInput book={book} value={position} onChange={setPosition} />
            )}

            <Field label="The one idea worth keeping">
              <NoteEditor value={body} onChange={setBody} />
            </Field>
          </>
        )}
      </div>

      {celebrate && (
        <Celebration
          title={celebrate.title}
          from={celebrate.from}
          to={celebrate.to}
          detail={book?.title}
          onDone={() => navigate({ name: 'home' })}
        />
      )}
    </Screen>
  )
}
