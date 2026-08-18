/**
 * Note drafts, kept in localStorage.
 *
 * iOS discards a backgrounded web app aggressively and relaunches it cold from
 * start_url. Losing a note someone typed one-handed at 6am is the single most
 * habit-breaking failure this app could have, so the draft is written as they
 * type and flushed synchronously on pagehide — localStorage is used precisely
 * because it is synchronous, which an IndexedDB write on pagehide is not.
 */
export interface Draft {
  bookId: string
  chapterLabel: string
  position: number | null
  body: string
  savedAt: number
}

const KEY = 'chapter.draft'

export function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const d = parsed as Partial<Draft>
    if (typeof d.bookId !== 'string' || typeof d.body !== 'string') return null
    return {
      bookId: d.bookId,
      chapterLabel: typeof d.chapterLabel === 'string' ? d.chapterLabel : '',
      position: typeof d.position === 'number' ? d.position : null,
      body: d.body,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeDraft(draft: Omit<Draft, 'savedAt'>, now = Date.now()): void {
  try {
    // An empty draft is not worth restoring, and clearing it keeps the
    // "you have an unfinished note" prompt honest.
    if (draft.body.trim() === '' && draft.chapterLabel.trim() === '') {
      localStorage.removeItem(KEY)
      return
    }
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: now }))
  } catch {
    /* Private mode or a full quota — the draft is a safety net, not the data. */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
