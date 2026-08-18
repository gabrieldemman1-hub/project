import { Cover } from '../../components/Cover'
import { ProgressBar } from '../../components/ProgressBar'
import { hasMeasurableProgress, percentLabel, progressLabel } from '../../lib/format'
import { hrefFor } from '../../lib/router'
import type { Book } from '../../db/schema'

export function BookCard({ book }: { book: Book }) {
  const measurable = hasMeasurableProgress(book)
  return (
    <a
      href={hrefFor({ name: 'book', id: book.id })}
      className="flex gap-3.5 items-center py-3 min-h-11"
    >
      <Cover book={book} className="w-12 h-[4.5rem] [container-type:inline-size]" />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug truncate">{book.title}</p>
        <p className="text-sm text-ink-quiet truncate mt-0.5">{book.author}</p>
        <div className="mt-2 flex items-center gap-2.5">
          {measurable && (
            <div className="flex-1">
              <ProgressBar percent={book.percentComplete} label={`${book.title} progress`} />
            </div>
          )}
          <span className={`text-xs tnum text-ink-faint ${measurable ? '' : 'flex-1'}`}>
            {measurable && book.percentComplete > 0
              ? `${percentLabel(book.percentComplete)} · ${progressLabel(book)}`
              : progressLabel(book)}
          </span>
        </div>
      </div>
    </a>
  )
}
