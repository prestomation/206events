import { defineConfig, devices } from '@playwright/test'

// Browser (E2E) test config for the 206.events web UI.
//
// Tests serve the production bundle (`vite build` → ../output) via `vite
// preview` and mock every runtime data fetch at the browser level (see
// e2e/mock-routes.js), so the suite is hermetic: no calendar generation, no
// API secrets, no live network.
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Build the bundle and serve it. Command runs from this config's directory
  // (web/), so it uses web/package.json's own build + preview scripts.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
