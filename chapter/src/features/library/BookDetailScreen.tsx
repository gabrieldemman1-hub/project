import { useState } from 'react'
import { Screen } from '../../components/Screen'
import { Button, LinkButton } from '../../components/Button'
import { Card } from '../../components/Card'
import { Cover } from '../../components/Cover'
import { ProgressBar } from '../../components/ProgressBar'
import { BookForm } from './BookForm'
import { useLive } from '../../lib/useLive'
import { getBook, logsForBook, notesForBook } from '../../db/queries'
import { deleteBook, enrichBook, setTodaysBook } from '../../db/mutations'
import { hasMeasurableProgress, percentLabel, progressLabel, shortDate } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'

export function BookDetailScreen({ id }: { id: string }) {
  const book = useLive(() => getBook(id), [id])
  const logs = useLive(() => logsForBook(id), [id])
  const notes = useLive(() => notesForBook(id), [id])
  const [editing, setEditing] = useState(false)
  const [looking, setLooking] = useState(false)
  const [lookupNote, setLookupNote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!book) return <Screen back={{ label: 'Library', href: hrefFor({ name: 'library' }) }}>{null}</Screen>

  async function lookUp() {
    setLooking(true)
    setLookupNote(null)
    const outcome = await enrichBook(id)
    setLooking(false)
    setLookupNote(
      outcome === 'enriched'
        ? 'Found it — cover and page count updated.'
        : outcome === 'partial'
          ? 'Found a cover, but the author did not match well enough to trust the page count. Set it yourself below.'
          : 'Nothing usable came back. Set the page count yourself below.',
    )
  }

  return (
    <Screen back={{ label: 'Library', href: hrefFor({ name: 'library' }) }}>
      <div className="flex gap-4 items-start mt-1">
        <Cover book={book} className="w-24 h-36 [container-type:inline-size]" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight">{book.title}</h1>
          <p className="text-sm text-ink-quiet mt-1">{book.author}</p>
          <p className="text-xs text-ink-faint mt-2 capitalize">
            {book.progressUnit === 'percent' ? 'Audiobook · percent' : 'Pages'}
          </p>
          {book.isToday === 1 ? (
            <p className="text-xs text-accent-ink mt-2 font-medium">Today's book</p>
          ) : (
            <Button variant="quiet" className="-ml-3 mt-1" onClick={() => setTodaysBook(book.id)}>
              Make this today's book
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5">
        {hasMeasurableProgress(book) && <ProgressBar percent={book.percentComplete} />}
        <p className="text-sm text-ink-quiet mt-2 tnum">
          {hasMeasurableProgress(book) && book.percentComplete > 0
            ? `${percentLabel(book.percentComplete)} · ${progressLabel(book)}`
            : progressLabel(book)}
        </p>
      </div>

      {editing ? (
        <BookForm book={book} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex gap-2 mt-5">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="secondary" className="flex-1" onClick={lookUp} disabled={looking}>
              {looking ? 'Looking…' : 'Look up again'}
            </Button>
          </div>
          {lookupNote && <p className="text-sm text-ink-quiet mt-3 leading-relaxed">{lookupNote}</p>}
        </>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-quiet mb-2">
          Notes {notes && notes.length > 0 ? `(${notes.length})` : ''}
        </h2>
        {notes && notes.length > 0 ? (
          <ul className="space-y-2.5">
            {notes.map((note) => (
              <li key={note.id}>
                <Card className="p-3.5">
                  <p className="text-xs text-ink-faint">
                    {note.chapterLabel} · {shortDate(note.createdAt)}
                  </p>
                  <p className="serif text-[0.975rem] leading-relaxed mt-1.5">{note.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">Nothing yet.</p>
        )}
      </section>

      {logs && logs.length > 0 && (
        <section className="mt-7">
          <h2 className="text-sm font-medium text-ink-quiet mb-2">Chapters logged ({logs.length})</h2>
          <ul className="text-sm text-ink-quiet space-y-1.5 tnum">
            {logs.map((log) => (
              <li key={log.id} className="flex justify-between gap-3">
                <span className="truncate">{log.chapterLabel}</span>
                <span className="text-ink-faint shrink-0">
                  {log.progressUnit === 'percent' ? `${log.position}%` : `p. ${log.position}`} ·{' '}
                  {shortDate(log.loggedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 pt-5 border-t border-[var(--border)]">
        {confirmDelete ? (
          <div className="space-y-3">
            <p className="text-sm text-ink leading-relaxed">
              Delete <strong>{book.title}</strong>, its {logs?.length ?? 0} logged chapters,{' '}
              {notes?.length ?? 0} notes and every review scheduled for them? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={async () => {
                  await deleteBook(book.id)
                  navigate({ name: 'library' })
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="quiet" className="-ml-3 text-warn" onClick={() => setConfirmDelete(true)}>
            Delete this book
          </Button>
        )}
      </section>

      <div className="mt-8">
        <LinkButton href={hrefFor({ name: 'log', bookId: book.id })} full>
          Log a chapter
        </LinkButton>
      </div>
    </Screen>
  )
}
