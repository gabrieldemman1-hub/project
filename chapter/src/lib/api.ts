/**
 * Presence of the Phase 4 server routes.
 *
 * Phases 1-3 are a pure static site and stay that way. Voice capture and AI
 * grading exist only when the app is deployed somewhere that runs functions,
 * with the relevant keys set. The client asks once per launch and hides both
 * features completely when the answer is no — a dead button is worse than a
 * missing one, and this app is meant to be deployable to plain static hosting.
 */
export interface ServerFeatures {
  transcribe: boolean
  grade: boolean
}

export const NO_SERVER: ServerFeatures = { transcribe: false, grade: false }

let cached: Promise<ServerFeatures> | null = null

export async function probeServer(fetchImpl: typeof fetch = fetch): Promise<ServerFeatures> {
  try {
    const res = await fetchImpl('/api/health', {
      signal: AbortSignal.timeout(4000),
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return NO_SERVER
    const payload: unknown = await res.json()
    if (typeof payload !== 'object' || payload === null) return NO_SERVER
    const p = payload as Partial<ServerFeatures>
    return { transcribe: p.transcribe === true, grade: p.grade === true }
  } catch {
    // Static hosting, offline, or no functions deployed. All the same answer.
    return NO_SERVER
  }
}

export function serverFeatures(fetchImpl: typeof fetch = fetch): Promise<ServerFeatures> {
  cached ??= probeServer(fetchImpl)
  return cached
}

/** Testing seam. */
export function resetServerProbe(): void {
  cached = null
}
