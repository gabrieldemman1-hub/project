/*
 * GENERATED FILE — DO NOT EDIT.
 * Written by scripts/generate-service-worker.ts on every build.
 */

const CACHE = 'workout-precache-42a2f9c8d90c'
// Relative to the worker's scope, so the same worker serves / locally and
// /project/ on GitHub Pages.
const RELATIVE_ASSETS = [
  "assets/HistoryScreen-BHiZDF7V.js",
  "assets/SettingsScreen-D-uWoinW.js",
  "assets/index-CTCSZmvt.css",
  "assets/index-CmTfej9W.js",
  "assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2",
  "assets/inter-cyrillic-wght-normal-DqGufNeO.woff2",
  "assets/inter-greek-ext-wght-normal-DlzME5K_.woff2",
  "assets/inter-greek-wght-normal-CkhJZR-_.woff2",
  "assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2",
  "assets/inter-latin-wght-normal-Dx4kXJAl.woff2",
  "assets/inter-vietnamese-wght-normal-CBcvBZtf.woff2",
  "assets/space-grotesk-latin-ext-wght-normal-D9tNdqV9.woff2",
  "assets/space-grotesk-latin-wght-normal-BhU9QXUp.woff2",
  "assets/space-grotesk-vietnamese-wght-normal-D0rl6rjA.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "manifest.webmanifest"
]

const SCOPE = self.registration.scope
const INDEX = new URL('index.html', SCOPE).href
const ASSETS = RELATIVE_ASSETS.map((path) => new URL(path, SCOPE).href)

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the HTTP cache so the precache always holds what
  // the server is serving now, not a stale intermediary copy.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        ASSETS.map((url) =>
          fetch(new Request(url, { cache: 'reload' })).then((response) => {
            if (!response.ok) throw new Error('precache failed: ' + url)
            return cache.put(url, response)
          }),
        ),
      ),
    ),
  )
  // No skipWaiting(): a new version must never swap the app's files out from
  // under a session in progress. It takes over on the next full open.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('workout-precache-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Any navigation gets the app shell; the hash router does the rest.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(INDEX).then((cached) => cached ?? fetch(request)),
    )
    return
  }

  event.respondWith(
    caches
      .match(url.href, { ignoreSearch: true })
      .then((cached) => cached ?? fetch(request)),
  )
})
