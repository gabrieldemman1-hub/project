import { Stepper } from '../../components/Stepper'
import { FieldGroup } from '../../components/Field'
import type { Book } from '../../db/schema'

/**
 * Format-aware. An audiobook has no pages, so it gets a percent stepper and the
 * page fields are absent rather than disabled.
 */
export function PositionInput({
  book,
  value,
  onChange,
}: {
  book: Book
  value: number
  onChange: (n: number) => void
}) {
  if (book.progressUnit === 'percent') {
    return (
      <FieldGroup label="Percent complete" hint="Audiobook — track where you are as a percentage.">
        <Stepper
          label="Percent complete"
          value={value}
          onChange={onChange}
          step={1}
          fastStep={5}
          min={0}
          max={100}
          suffix="%"
        />
      </FieldGroup>
    )
  }

  return (
    <FieldGroup
      label="Current page"
      hint={
        book.totalPages
          ? `of ${book.totalPages}. Hold − or + to move faster.`
          : 'No page count set yet — the percentage stays blank until you add one on the book.'
      }
    >
      <Stepper
        label="Current page"
        value={value}
        onChange={onChange}
        step={1}
        fastStep={10}
        min={0}
        max={book.totalPages ?? 99999}
      />
    </FieldGroup>
  )
}
