/**
 * Storage durability.
 *
 * WebKit deletes all script-writable storage for an origin after 7 days with no
 * interaction. A home-screen web app keeps its own counter, which the morning
 * ritual resets — which is why installing is a requirement, not a nicety.
 * `navigator.storage.persist()` asks to be exempt outright; it must be called
 * from a user gesture to have a chance of being granted.
 */

const ASKED_KEY = 'chapter.persist-asked'

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/** Idempotent, gesture-safe, and silent when unsupported. */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  try {
    if (await navigator.storage.persisted()) return true
    if (localStorage.getItem(ASKED_KEY) === '1') return false
    localStorage.setItem(ASKED_KEY, '1')
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageReport(): Promise<{
  persisted: boolean | null
  usageMb: number | null
  quotaMb: number | null
}> {
  if (!navigator.storage?.estimate) return { persisted: null, usageMb: null, quotaMb: null }
  try {
    const [persisted, estimate] = await Promise.all([
      navigator.storage.persisted?.() ?? Promise.resolve(null),
      navigator.storage.estimate(),
    ])
    const mb = (n: number | undefined) => (n === undefined ? null : Math.round((n / 1048576) * 10) / 10)
    return { persisted, usageMb: mb(estimate.usage), quotaMb: mb(estimate.quota) }
  } catch {
    return { persisted: null, usageMb: null, quotaMb: null }
  }
}

/** Registers the service worker, scoped so a subdirectory deploy works. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    // baseURI is the directory index.html was served from — correct under both
    // a domain root and /project/chapter/. Hash routing keeps it stable.
    const base = new URL('.', document.baseURI)
    navigator.serviceWorker
      .register(new URL('sw.js', base).href, { scope: base.pathname })
      .catch(() => {
        /* No service worker is a degraded experience, not a broken one. */
      })
  })
}
