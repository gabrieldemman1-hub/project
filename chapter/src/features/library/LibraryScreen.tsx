import { useState } from 'react'
import { Screen } from '../../components/Screen'
import { LinkButton, Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { BookCard } from './BookCard'
import { useLive } from '../../lib/useLive'
import { allBooks } from '../../db/queries'
import { enrichAll } from '../../db/mutations'
import { hrefFor } from '../../lib/router'

export function LibraryScreen() {
  const books = useLive(() => allBooks(), [])
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function runEnrich() {
    setResult(null)
    setEnriching({ done: 0, total: books?.length ?? 0 })
    const tally = await enrichAll(fetch, (done, total) => setEnriching({ done, total }))
    setEnriching(null)
    setResult(
      tally.enriched + tally.partial === 0
        ? 'No luck — Open Library is unreachable or had nothing. Set page counts yourself on each book.'
        : `${tally.enriched} complete, ${tally.partial} cover only, ${tally.failed} not found.`,
    )
  }

  const missing = books?.filter((b) => b.totalPages === null).length ?? 0

  return (
    <Screen
      title="Library"
      back={{ label: 'Home', href: hrefFor({ name: 'home' }) }}
      action={
        <a href={hrefFor({ name: 'settings' })} className="text-sm text-ink-quiet min-h-11 flex items-center">
          Settings
        </a>
      }
      footer={
        <LinkButton href={hrefFor({ name: 'log', bookId: null })} full>
          Log a chapter
        </LinkButton>
      }
    >
      {books === undefined ? null : books.length === 0 ? (
        <EmptyState title="No books yet" body="The shelf seeds itself on first launch." />
      ) : (
        <>
          {missing > 0 && (
            <div className="mt-2 mb-1 p-3.5 rounded-[var(--radius-md)] bg-accent-soft text-sm leading-relaxed">
              <p className="text-ink">
                {missing} of {books.length} books have no page count yet. Look them up, or set them
                yourself on each book — Open Library is often wrong anyway.
              </p>
              <Button
                variant="quiet"
                className="mt-1.5 -ml-3 text-accent-ink underline underline-offset-4 decoration-2"
                onClick={runEnrich}
                disabled={enriching !== null}
              >
                {enriching ? `Looking up ${enriching.done}/${enriching.total}…` : 'Look them up'}
              </Button>
              {result && <p className="text-ink-quiet mt-1">{result}</p>}
            </div>
          )}

          <ul className="divide-y divide-[var(--border)]">
            {books.map((book) => (
              <li key={book.id}>
                <BookCard book={book} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  )
}
