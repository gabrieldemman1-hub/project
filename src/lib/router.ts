import { useEffect, useState } from 'react'

import type { IsoDate } from '../db/schema'

/**
 * Hash routing in ~30 lines, per PLAN §3: six screens do not justify a
 * routing dependency, and hash URLs keep working when the app is launched
 * offline from a home-screen icon, where path-based routing would need a
 * server that isn't there.
 */

/** `/` is the dashboard — the app's front door; `/today` is the day's plan. */
export type Route = '/' | '/today' | '/session' | '/history' | '/settings'

const ROUTES: Route[] = ['/today', '/session', '/history', '/settings']

/**
 * A route may carry one optional day — `#/today?d=2026-08-19` — so the
 * dashboard's week board can open a particular day rather than only today.
 */
function parseHash(): { route: Route; day: IsoDate | null } {
  const [path = '', query = ''] = window.location.hash.replace(/^#/, '').split('?')
  return {
    route: ROUTES.find((route) => route === path) ?? '/',
    day: new URLSearchParams(query).get('d'),
  }
}

function currentRoute(): Route {
  return parseHash().route
}

/** The day a deep link asked for, if any. Read once, on mount. */
export function routeDay(): IsoDate | null {
  return parseHash().day
}

/**
 * Drops the day from the URL without navigating, so the deep link acts once:
 * reloading the app later lands on today, not on whatever day was last
 * peeked at.
 */
export function clearRouteDay(): void {
  const { route, day } = parseHash()
  if (!day) return
  window.history.replaceState(null, '', route === '/' ? '#' : `#${route}`)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute)

  useEffect(() => {
    const onChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function navigate(route: Route, options?: { day?: IsoDate }): void {
  const day = options?.day
  window.location.hash = route === '/' ? '' : `#${route}${day ? `?d=${day}` : ''}`
}
