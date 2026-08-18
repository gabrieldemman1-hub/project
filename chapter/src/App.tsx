import { useEffect, useState } from 'react'
import { useRoute } from './lib/router'
import { LibraryScreen } from './features/library/LibraryScreen'
import { BookDetailScreen } from './features/library/BookDetailScreen'
import { LogChapterScreen } from './features/log/LogChapterScreen'
import { seedLibrary } from './db/mutations'
import { ensureSettings } from './db/db'
import { requestPersistence } from './lib/storage'

export default function App() {
  const route = useRoute()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      await ensureSettings()
      await seedLibrary()
      setReady(true)
    })()
  }, [])

  // Storage permission has to be asked for from inside a gesture, so it rides
  // the first tap rather than firing on load where it would be refused.
  useEffect(() => {
    const ask = () => {
      void requestPersistence()
      window.removeEventListener('pointerdown', ask)
    }
    window.addEventListener('pointerdown', ask, { once: true })
    return () => window.removeEventListener('pointerdown', ask)
  }, [])

  if (!ready) return <div className="min-h-full bg-ground" />

  switch (route.name) {
    case 'book':
      return <BookDetailScreen id={route.id} />
    case 'log':
      return <LogChapterScreen bookId={route.bookId} />
    // The dashboard arrives in Phase 2; until then the library is the front door.
    case 'home':
    case 'library':
    default:
      return <LibraryScreen />
  }
}
