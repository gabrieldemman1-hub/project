// Imported from vitest/config rather than vite so the `test` block below is
// typed; it is the same defineConfig otherwise.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { tokensCssPlugin } from './scripts/generate-tokens-css.ts'

export default defineConfig({
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
