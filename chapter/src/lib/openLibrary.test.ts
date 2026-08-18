import { describe, expect, it, vi } from 'vitest'
import {
  authorAgrees,
  buildSearchUrl,
  coverUrlFor,
  isParasiteTitle,
  lookup,
  normalise,
  pickMatch,
} from './openLibrary'

/** A payload shaped like a real Open Library search response. */
function payload(docs: unknown[]) {
  return { numFound: docs.length, docs }
}

const HORMOZI = {
  key: '/works/OL27919473W',
  title: '$100M Offers',
  author_name: ['Alex Hormozi'],
  cover_i: 12583098,
  number_of_pages_median: 174,
}

describe('normalise', () => {
  it('strips the punctuation that breaks these particular titles', () => {
    expect(normalise('$100M Offers')).toBe('100m offers')
    expect(normalise('The 7 Habits of Highly Effective People')).toBe(
      'the 7 habits of highly effective people',
    )
    expect(normalise("I Will Teach You to Be Rich")).toBe('i will teach you to be rich')
  })

  it('flattens curly quotes, which Open Library uses and our seed does not', () => {
    expect(normalise('Don’t Make Me Think')).toBe('dont make me think')
  })
})

describe('buildSearchUrl', () => {
  it('asks for only the five fields we use', () => {
    const url = buildSearchUrl('$100M Offers', 'Alex Hormozi')
    expect(url).toContain('title=%24100M+Offers')
    expect(url).toContain('author=Alex+Hormozi')
    expect(url).toContain('fields=key%2Ctitle%2Cauthor_name%2Ccover_i%2Cnumber_of_pages_median')
    expect(url).toContain('limit=5')
  })
})

describe('coverUrlFor', () => {
  it('disables the placeholder so a missing cover 404s instead of returning a grey box', () => {
    expect(coverUrlFor(123)).toBe('https://covers.openlibrary.org/b/id/123-M.jpg?default=false')
  })
})

describe('pickMatch', () => {
  it('takes an exact title + author match with high confidence', () => {
    const m = pickMatch(payload([HORMOZI]), '$100M Offers', 'Alex Hormozi')
    expect(m).not.toBeNull()
    expect(m?.confidence).toBe('high')
    expect(m?.totalPages).toBe(174)
    expect(m?.coverUrl).toContain('12583098')
    expect(m?.olKey).toBe('/works/OL27919473W')
  })

  it('prefers the agreeing author over a better title match', () => {
    const decoy = {
      key: '/works/DECOY',
      title: '$100M Offers',
      author_name: ['Someone Else'],
      number_of_pages_median: 999,
    }
    const m = pickMatch(payload([decoy, HORMOZI]), '$100M Offers', 'Alex Hormozi')
    expect(m?.olKey).toBe('/works/OL27919473W')
    expect(m?.totalPages).toBe(174)
  })

  it('REFUSES a page count when the author does not agree — this protects every percentage', () => {
    const wrongAuthor = {
      key: '/works/OTHER',
      title: 'Think Again',
      author_name: ['A Different Person'],
      cover_i: 555,
      number_of_pages_median: 900,
    }
    const m = pickMatch(payload([wrongAuthor]), 'Think Again', 'Adam Grant')
    expect(m?.confidence).toBe('low')
    expect(m?.totalPages).toBeNull()
    // A cover is still worth having.
    expect(m?.coverUrl).toContain('555')
  })

  it('matches a subtitle-extended title', () => {
    const doc = {
      key: '/works/OL1W',
      title: 'Good to Great: Why Some Companies Make the Leap and Others Don’t',
      author_name: ['Jim Collins'],
      number_of_pages_median: 300,
    }
    const m = pickMatch(payload([doc]), 'Good to Great', 'Jim Collins')
    expect(m?.confidence).toBe('high')
    expect(m?.totalPages).toBe(300)
  })

  it('matches a multi-author book on any one surname', () => {
    const doc = {
      key: '/works/OL2W',
      title: 'Crucial Conversations',
      author_name: ['Kerry Patterson', 'Joseph Grenny'],
      number_of_pages_median: 244,
    }
    const m = pickMatch(
      payload([doc]),
      'Crucial Conversations',
      'Patterson, Grenny, McMillan, Switzler',
    )
    expect(m?.confidence).toBe('high')
    expect(m?.totalPages).toBe(244)
  })

  it('returns null when nothing resembles the title', () => {
    const doc = { key: '/works/OL3W', title: 'Cooking With Fire', author_name: ['Adam Grant'] }
    expect(pickMatch(payload([doc]), 'Think Again', 'Adam Grant')).toBeNull()
  })

  it('survives every shape of malformed payload', () => {
    expect(pickMatch(null, 'a', 'b')).toBeNull()
    expect(pickMatch({}, 'a', 'b')).toBeNull()
    expect(pickMatch({ docs: 'nope' }, 'a', 'b')).toBeNull()
    expect(pickMatch(payload([null, 42, 'x']), 'a', 'b')).toBeNull()
    expect(pickMatch(payload([{ title: 'a' }]), 'a', 'b')).toBeNull() // no key
  })

  it('ignores a nonsense page count', () => {
    const doc = { ...HORMOZI, number_of_pages_median: -5 }
    expect(pickMatch(payload([doc]), '$100M Offers', 'Alex Hormozi')?.totalPages).toBeNull()
  })

  it('handles a book with no cover', () => {
    const doc = { ...HORMOZI, cover_i: undefined }
    expect(pickMatch(payload([doc]), '$100M Offers', 'Alex Hormozi')?.coverUrl).toBeNull()
  })
})

describe('lookup — every failure returns null and nothing throws', () => {
  const ok = (body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch

  it('returns a match on a good response', async () => {
    const m = await lookup('$100M Offers', 'Alex Hormozi', ok(payload([HORMOZI])))
    expect(m?.totalPages).toBe(174)
  })

  it('returns null on 404', async () => {
    const f = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    expect(await lookup('x', 'y', f)).toBeNull()
  })

  it('returns null on 429 rather than retrying into a rate limit', async () => {
    const f = vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch
    expect(await lookup('x', 'y', f)).toBeNull()
  })

  it('returns null when offline', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await lookup('x', 'y', f)).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    const f = vi.fn(async () => new Response('{not json', { status: 200 })) as unknown as typeof fetch
    expect(await lookup('x', 'y', f)).toBeNull()
  })

  it('returns null when the response is JSON but the wrong shape', async () => {
    expect(await lookup('x', 'y', ok({ unexpected: true }))).toBeNull()
  })
})

describe('authorAgrees — the guard that stops a wrong page count', () => {
  it('matches on surname', () => {
    expect(authorAgrees(['Adam Grant'], 'Adam Grant')).toBe(true)
    expect(authorAgrees(['Adam M. Grant'], 'Adam Grant')).toBe(true)
  })

  it('does NOT match a shared FIRST name — this was a real bug', () => {
    expect(authorAgrees(['Not Adam'], 'Adam Grant')).toBe(false)
    expect(authorAgrees(['Alex Someone'], 'Alex Hormozi')).toBe(false)
  })

  it('accepts any surname from a comma-separated credit', () => {
    const wanted = 'Patterson, Grenny, McMillan, Switzler'
    expect(authorAgrees(['Kerry Patterson', 'Joseph Grenny'], wanted)).toBe(true)
    expect(authorAgrees(['Al Switzler'], wanted)).toBe(true)
    expect(authorAgrees(['Someone Unrelated'], wanted)).toBe(false)
  })

  it('handles a middle initial and a hyphenated surname', () => {
    expect(authorAgrees(['John C. Maxwell'], 'John C. Maxwell')).toBe(true)
    expect(authorAgrees(['Patrick Bet-David'], 'Patrick Bet-David')).toBe(true)
  })

  it('rejects an empty credit list', () => {
    expect(authorAgrees([], 'Adam Grant')).toBe(false)
  })

  it('resolves every author in the seeded library against itself', async () => {
    const { SEED_BOOKS } = await import('../db/seed')
    for (const b of SEED_BOOKS) {
      expect(authorAgrees([b.author], b.author)).toBe(true)
    }
  })
})

describe('parasite titles — a summary of the book is not the book', () => {
  it('recognises the usual parasites', () => {
    expect(isParasiteTitle('Summary of $100M Offers by Alex Hormozi')).toBe(true)
    expect(isParasiteTitle('Workbook for Think Again')).toBe(true)
    expect(isParasiteTitle('Good to Great: Key Takeaways')).toBe(true)
    expect(isParasiteTitle('Conversation Starters: This Is Marketing')).toBe(true)
    expect(isParasiteTitle('$100M Offers')).toBe(false)
    expect(isParasiteTitle('Getting Things Done')).toBe(false)
  })

  it('skips a summary even when the real author is named in its title', () => {
    // This one passes the author check, which is exactly why it needs its own guard.
    const parasite = {
      key: '/works/PARASITE',
      title: 'Summary of $100M Offers by Alex Hormozi',
      author_name: ['Alex Hormozi'],
      cover_i: 1,
      number_of_pages_median: 42,
    }
    expect(pickMatch(payload([parasite]), '$100M Offers', 'Alex Hormozi')).toBeNull()
  })

  it('still picks the real book when both are returned', () => {
    const parasite = {
      key: '/works/PARASITE',
      title: 'Workbook for $100M Offers',
      author_name: ['Alex Hormozi'],
      cover_i: 1,
      number_of_pages_median: 42,
    }
    const m = pickMatch(payload([parasite, HORMOZI]), '$100M Offers', 'Alex Hormozi')
    expect(m?.olKey).toBe('/works/OL27919473W')
    expect(m?.totalPages).toBe(174)
  })

  it('does not reject a book whose real title contains the word', () => {
    const doc = {
      key: '/works/OLX',
      title: 'The Companion',
      author_name: ['Someone Real'],
      number_of_pages_median: 200,
    }
    expect(pickMatch(payload([doc]), 'The Companion', 'Someone Real')?.totalPages).toBe(200)
  })
})
