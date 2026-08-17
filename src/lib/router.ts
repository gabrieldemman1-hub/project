import { useEffect, useState } from 'react'

/**
 * Hash routing in ~30 lines, per PLAN §3: six screens do not justify a
 * routing dependency, and hash URLs keep working when the app is launched
 * offline from a home-screen icon, where path-based routing would need a
 * server that isn't there.
 */

export type Route = '/' | '/session'

function currentRoute(): Route {
  return window.location.hash === '#/session' ? '/session' : '/'
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

export function navigate(route: Route): void {
  window.location.hash = route === '/' ? '' : `#${route}`
}
