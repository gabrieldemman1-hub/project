import { beforeEach, describe, expect, it } from 'vitest'
import { clearDraft, readDraft, writeDraft } from './draft'

beforeEach(() => localStorage.clear())

describe('draft', () => {
  it('round-trips a note in progress', () => {
    writeDraft({ bookId: 'bk_1', chapterLabel: 'Chapter 3', position: 42, body: 'half a thought' }, 1000)
    expect(readDraft()).toEqual({
      bookId: 'bk_1',
      chapterLabel: 'Chapter 3',
      position: 42,
      body: 'half a thought',
      savedAt: 1000,
    })
  })

  it('returns null when there is nothing saved', () => {
    expect(readDraft()).toBeNull()
  })

  it('does not save an empty draft, so the restore prompt stays honest', () => {
    writeDraft({ bookId: 'bk_1', chapterLabel: '   ', position: 10, body: '  ' })
    expect(readDraft()).toBeNull()
  })

  it('saves a draft that has a chapter but no body yet', () => {
    writeDraft({ bookId: 'bk_1', chapterLabel: 'Ch 1', position: 1, body: '' })
    expect(readDraft()?.chapterLabel).toBe('Ch 1')
  })

  it('clears', () => {
    writeDraft({ bookId: 'bk_1', chapterLabel: 'Ch 1', position: 1, body: 'x' })
    clearDraft()
    expect(readDraft()).toBeNull()
  })

  it('survives corrupted storage rather than throwing into the UI', () => {
    localStorage.setItem('chapter.draft', '{not json')
    expect(readDraft()).toBeNull()
    localStorage.setItem('chapter.draft', '"a string"')
    expect(readDraft()).toBeNull()
    localStorage.setItem('chapter.draft', '{"bookId":1,"body":2}')
    expect(readDraft()).toBeNull()
  })

  it('fills in missing optional fields rather than returning a half object', () => {
    localStorage.setItem('chapter.draft', JSON.stringify({ bookId: 'bk_1', body: 'x' }))
    expect(readDraft()).toEqual({
      bookId: 'bk_1',
      chapterLabel: '',
      position: null,
      body: 'x',
      savedAt: 0,
    })
  })
})
