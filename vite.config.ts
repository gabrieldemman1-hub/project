// Imported from vitest/config rather than vite so the `test` block below is
// typed; it is the same defineConfig otherwise.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { tokensCssPlugin } from './scripts/generate-tokens-css.ts'

export default defineConfig({
  /*
   * GitHub Pages serves the app from https://<user>.github.io/<repo>/ rather
   * than from the root of the domain, so every asset URL needs that prefix.
   * The deploy workflow sets it; locally this stays '/' so `npm run dev` is
   * unaffected.
   */
  base: process.env['VITE_BASE_PATH'] ?? '/',
  // tokensCssPlugin runs first so Tailwind always compiles against fresh tokens.
  plugins: [tokensCssPlugin(), tailwindcss(), react()],
  server: {
    host: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
