import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { colors } from './styles/tokens'
import './styles/index.css'

// The iOS status bar and Android address bar take their colour from this meta
// tag, which HTML cannot read from a CSS variable. Setting it here keeps
// tokens.ts the only place the background colour is defined.
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute('content', colors.bg)

// Ask the browser to exempt this origin's storage from eviction — the first
// of PLAN §2.2's three defences against iOS deleting IndexedDB. Usually
// granted once the app is installed to the home screen. Fire-and-forget: the
// app works either way, this only makes the storage safer.
void navigator.storage?.persist?.()

// The service worker only exists in a production build (dist/sw.js is written
// by the build), and registration waits for load so it never competes with
// the app's own startup for bandwidth on a gym connection.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        // Offline capability is an enhancement; a failed registration must
        // never take the app down with it.
      })
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
