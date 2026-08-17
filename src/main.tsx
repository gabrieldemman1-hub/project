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

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
