/*
 * Chapter's service worker.
 *
 * The morning ritual happens on trains and in basements, so the app has to open
 * with no network. Strategy:
 *   - navigations: cache-first on the shell, so a cold offline launch works
 *   - hashed build assets and fonts: cache-first, they are immutable
 *   - everything else same-origin: stale-while-revalidate
 *   - /api/*: never cached (Phase 4 talks to real endpoints)
 *   - cross-origin (Open Library): never cached, always allowed to fail
 *
 * Runtime caching rather than a build-time precache manifest: it needs no build
 * step, and Vite's content-hashed filenames make cache-first safe.
 */
const VERSION = 'chapter-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`

const SCOPE_PATH = new URL(self.registration.scope).pathname
const SHELL_URL = SCOPE_PATH

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([SHELL_URL, `${SCOPE_PATH}manifest.webmanifest`]))
      .then(() => self.skipWaiting())
      // A failed precache must never block installation — the app still works
      // online, and the next visit will populate the cache at runtime.
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

function isImmutableAsset(url) {
  return (
    url.pathname.includes('/assets/') ||
    /\.(woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Phase 4's server routes must always hit the network.
  if (url.pathname.includes('/api/')) return
  // Open Library and anything else off-origin: let it fail normally.
  if (url.origin !== self.location.origin) return

  // A navigation offline should still open the app.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put(SHELL_URL, copy))
          return res
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit ?? Response.error())),
    )
    return
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(ASSETS).then((c) => c.put(request, copy))
            return res
          }),
      ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(ASSETS).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => hit ?? Response.error())
      return hit ?? network
    }),
  )
})
