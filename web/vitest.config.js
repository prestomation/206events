import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    // Keep the Playwright e2e suite out of Vitest — its specs match Vitest's
    // default `*.spec.js` glob but use the @playwright/test runner, which
    // throws if Vitest tries to import them.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
