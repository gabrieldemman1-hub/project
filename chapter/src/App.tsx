import { useEffect, useState } from 'react'
import { useRoute } from './lib/router'
import { DashboardScreen } from './features/dashboard/DashboardScreen'
import { LibraryScreen } from './features/library/LibraryScreen'
import { BookDetailScreen } from './features/library/BookDetailScreen'
import { LogChapterScreen } from './features/log/LogChapterScreen'
import { NightSessionScreen } from './features/night/NightSessionScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { seedLibrary } from './db/mutations'
import { ensureSettings } from './db/db'
import { requestPersistence } from './lib/storage'
import { useTheme } from './lib/useTheme'
import { useLive } from './lib/useLive'
import { getSettings } from './db/queries'

export default function App() {
  const route = useRoute()
  const [ready, setReady] = useState(false)
  const settings = useLive(() => getSettings(), [])
  useTheme(settings)

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

  if (!ready) return <div className="min-h-dvh bg-ground" />

  switch (route.name) {
    case 'book':
      return <BookDetailScreen id={route.id} />
    case 'log':
      return <LogChapterScreen bookId={route.bookId} />
    case 'library':
      return <LibraryScreen />
    case 'night':
      return <NightSessionScreen />
    case 'settings':
      return <SettingsScreen />
    case 'home':
    default:
      return <DashboardScreen />
  }
}
