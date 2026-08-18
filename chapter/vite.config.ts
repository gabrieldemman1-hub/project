import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed under a subdirectory on GitHub Pages (/project/chapter/), at the root
// on Vercel. Relative asset URLs make the same bundle work in both, which is why
// index.html links './manifest.webmanifest' rather than '/manifest.webmanifest'.
const base = process.env.VITE_BASE_PATH ?? './'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
