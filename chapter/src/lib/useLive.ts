import { useLiveQuery } from 'dexie-react-hooks'

/**
 * Thin wrapper so components never import dexie-react-hooks directly — the same
 * rule as never importing Dexie. Returns undefined while the first read is in
 * flight, which callers render as a quiet loading state rather than an error.
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  return useLiveQuery(query, deps)
}
