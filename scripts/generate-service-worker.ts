/**
 * Vite plugin that writes `dist/sw.js` after every production build.
 *
 * The service worker is what makes the app open in airplane mode: it precaches
 * every built file (app code, both fonts, the lazy chart chunk, icons,
 * manifest) and serves them cache-first, so after one online visit the network
 * is never needed again. It is generated rather than hand-maintained because
 * the precache list must name the hashed filenames of each build — a stale
 * hand-written list is an app that half-works offline, which is worse than one
 * that doesn't pretend.
 *
 * Deliberately hand-rolled (~60 lines of worker) instead of adding Workbox:
 * a fully static, fully precached single-page app needs none of its routing
 * strategies, and a dependency-free worker is one the next reader can hold in
 * their head.
 *
 * Update model: a new build writes a new cache name (a hash of the contents).
 * The new worker installs alongside the old one and takes over when the app is
 * next fully closed and reopened — never mid-session, so a half-finished
 * workout can never have its lazy chunks swapped out from under it. Old caches
 * are deleted on activation.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function renderWorker(assets: string[], hash: string): string {
  return `/*
 * GENERATED FILE — DO NOT EDIT.
 * Written by scripts/generate-service-worker.ts on every build.
 */

const CACHE = 'workout-precache-${hash}'
// Relative to the worker's scope, so the same worker serves / locally and
// /project/ on GitHub Pages.
const RELATIVE_ASSETS = ${JSON.stringify(assets, null, 2)}

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
`
}

export function serviceWorkerPlugin(): Plugin {
  let outDir = ''
  return {
    name: 'workout-tracker:generate-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    // closeBundle runs after everything — hashed assets and public/ copies
    // alike — is on disk, so the walk below sees the complete output.
    closeBundle() {
      const files = walk(outDir)
        .map((file) => relative(outDir, file))
        .filter((file) => file !== 'sw.js')
        .sort()

      const digest = createHash('sha256')
      for (const file of files) {
        digest.update(file)
        digest.update(readFileSync(join(outDir, file)))
      }
      const hash = digest.digest('hex').slice(0, 12)

      writeFileSync(join(outDir, 'sw.js'), renderWorker(files, hash), 'utf8')
      this.info(`sw.js precaches ${files.length} files (cache ${hash})`)
    },
  }
}
