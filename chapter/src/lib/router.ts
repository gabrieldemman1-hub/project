import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'book'; id: string }
  | { name: 'log'; bookId: string | null }
  | { name: 'night' }
  | { name: 'settings' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  const [head, tail] = path.split('/')
  switch (head) {
    case 'library':
      return { name: 'library' }
    case 'book':
      return tail ? { name: 'book', id: tail } : { name: 'library' }
    case 'log':
      return { name: 'log', bookId: tail ?? null }
    case 'night':
      return { name: 'night' }
    case 'settings':
      return { name: 'settings' }
    default:
      return { name: 'home' }
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'library':
      return '#/library'
    case 'book':
      return `#/book/${route.id}`
    case 'log':
      return route.bookId ? `#/log/${route.bookId}` : '#/log'
    case 'night':
      return '#/night'
    case 'settings':
      return '#/settings'
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
