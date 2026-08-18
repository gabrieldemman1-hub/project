import type { Book } from '../db/schema'

export function percentLabel(n: number): string {
  return `${Math.round(n)}%`
}

/** What the shelf shows under a book. Never invents a percentage it doesn't have. */
export function progressLabel(book: Book): string {
  if (book.progressUnit === 'percent') {
    return book.percentComplete > 0 ? percentLabel(book.percentComplete) : 'Not started'
  }
  if (book.currentPage === null) return 'Not started'
  if (book.totalPages === null) return `p. ${book.currentPage}`
  return `p. ${book.currentPage} of ${book.totalPages}`
}

/** True when we can honestly draw a bar. */
export function hasMeasurableProgress(book: Book): boolean {
  if (book.progressUnit === 'percent') return true
  return book.totalPages !== null && book.totalPages > 0
}

export function positionLabel(book: Book): string {
  return book.progressUnit === 'percent' ? 'Percent complete' : 'Current page'
}

export function initialsOf(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase()
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function relativeDay(days: number): string {
  return RELATIVE.format(days, 'day')
}

export function shortDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
