import type { ProgressUnit } from './schema'

/**
 * The starting library. Title, author and progress unit ONLY.
 *
 * No page counts here, deliberately: they vary by edition and the brief is
 * explicit that they must not be hardcoded. `totalPages` starts null and is
 * filled by an Open Library lookup in the browser or by the user on the book's
 * detail screen. A book with a null page count is fully usable — it shows
 * 'p. 128' instead of a percentage.
 *
 * Everything seeds as 'pages'. Switching a book you own on audio to 'percent'
 * is one tap on its detail screen.
 */
export interface SeedBook {
  title: string
  author: string
  progressUnit: ProgressUnit
}

export const SEED_VERSION = 1

export const SEED_BOOKS: SeedBook[] = [
  { title: 'Buy Back Your Time', author: 'Dan Martell', progressUnit: 'pages' },
  { title: 'Think Again', author: 'Adam Grant', progressUnit: 'pages' },
  { title: 'Expert Secrets', author: 'Russell Brunson', progressUnit: 'pages' },
  { title: 'Traffic Secrets', author: 'Russell Brunson', progressUnit: 'pages' },
  { title: 'Think and Grow Rich', author: 'Napoleon Hill', progressUnit: 'pages' },
  { title: 'The Psychology of Money', author: 'Morgan Housel', progressUnit: 'pages' },
  { title: 'The Motive', author: 'Patrick Lencioni', progressUnit: 'pages' },
  { title: 'The Five Dysfunctions of a Team', author: 'Patrick Lencioni', progressUnit: 'pages' },
  { title: 'The 21 Irrefutable Laws of Leadership', author: 'John C. Maxwell', progressUnit: 'pages' },
  { title: 'Your Next Five Moves', author: 'Patrick Bet-David', progressUnit: 'pages' },
  { title: '$100M Offers', author: 'Alex Hormozi', progressUnit: 'pages' },
  { title: '$100M Leads', author: 'Alex Hormozi', progressUnit: 'pages' },
  { title: '$100M Money Models', author: 'Alex Hormozi', progressUnit: 'pages' },
  { title: 'This Is Marketing', author: 'Seth Godin', progressUnit: 'pages' },
  {
    title: 'Crucial Conversations',
    author: 'Patterson, Grenny, McMillan, Switzler',
    progressUnit: 'pages',
  },
  { title: 'Good to Great', author: 'Jim Collins', progressUnit: 'pages' },
  { title: 'Supercommunicators', author: 'Charles Duhigg', progressUnit: 'pages' },
  { title: 'Getting Things Done', author: 'David Allen', progressUnit: 'pages' },
  { title: 'The 7 Habits of Highly Effective People', author: 'Stephen Covey', progressUnit: 'pages' },
  { title: 'The AI-Driven Leader', author: 'Geoff Woods', progressUnit: 'pages' },
  { title: 'I Will Teach You to Be Rich', author: 'Ramit Sethi', progressUnit: 'pages' },
]
