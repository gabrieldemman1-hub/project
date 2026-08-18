import { useState } from 'react'
import { Button } from '../../components/Button'
import { Field, FieldGroup, TextInput } from '../../components/Field'
import { updateBook } from '../../db/mutations'
import type { Book, ProgressUnit } from '../../db/schema'

/**
 * Every field is editable. Open Library gets page counts wrong often enough that
 * manual override is a requirement, not a nicety — so this is a plain form, not
 * a locked-down "advanced settings" panel.
 */
export function BookForm({ book, onDone }: { book: Book; onDone: () => void }) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [unit, setUnit] = useState<ProgressUnit>(book.progressUnit)
  const [totalPages, setTotalPages] = useState(book.totalPages?.toString() ?? '')
  const [currentPage, setCurrentPage] = useState(book.currentPage?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const parsedTotal = totalPages.trim() === '' ? null : Number(totalPages)
    const parsedCurrent = currentPage.trim() === '' ? null : Number(currentPage)
    await updateBook(book.id, {
      title: title.trim() || book.title,
      author: author.trim() || book.author,
      progressUnit: unit,
      totalPages: Number.isFinite(parsedTotal) ? parsedTotal : null,
      currentPage: Number.isFinite(parsedCurrent) ? parsedCurrent : null,
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="space-y-4 mt-2">
      <Field label="Title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="Author">
        <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} />
      </Field>

      <FieldGroup
        label="Progress unit"
        hint={
          unit === 'percent'
            ? 'Audiobooks have no pages, so progress is a percentage and page fields disappear entirely.'
            : 'Switch to percent for an audiobook.'
        }
      >
        <div className="flex gap-2">
          {(['pages', 'percent'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setUnit(option)}
              aria-pressed={unit === option}
              className={`flex-1 min-h-11 rounded-[var(--radius-md)] border text-sm capitalize ${
                unit === option
                  ? 'bg-accent-soft border-accent text-accent-ink font-medium'
                  : 'bg-surface border-border-soft text-ink-quiet'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </FieldGroup>

      {/* Not disabled — absent. A percent book has no pages to talk about. */}
      {unit === 'pages' && (
        <>
          <Field label="Total pages" hint="Yours will differ from Open Library's. Trust your copy.">
            <TextInput
              value={totalPages}
              inputMode="numeric"
              placeholder="Unknown"
              onChange={(e) => setTotalPages(e.target.value)}
            />
          </Field>

          <Field label="Current page">
            <TextInput
              value={currentPage}
              inputMode="numeric"
              placeholder="Not started"
              onChange={(e) => setCurrentPage(e.target.value)}
            />
          </Field>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={onDone} className="flex-1">
          Cancel
        </Button>
        <Button onClick={save} disabled={saving} className="flex-1">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
