import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { registerServiceWorker } from './lib/storage'

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')

registerServiceWorker()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
