import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Read-only mode: a bundle built WITHOUT VITE_FAVORITES_API_URL has no favorites
// backend, so the You view hides the sign-in/account card and the personal-feed
// (ICS subscription) card entirely — both would otherwise show dead "Sign in…"
// prompts. The rest of the page stays functional (local favorites/filters).
//
// Because VITE_FAVORITES_API_URL is baked into the Vite bundle at build time and
// the shared e2e harness serves one build WITH it (see playwright.config.js),
// this state isn't reachable in the default suite — so we skip when login is
// enabled, mirroring lists.spec.js (which skips the inverse). To exercise/refresh
// the screenshot, build without the var:
//   VITE_FAVORITES_API_URL='' npm run build && npm run preview -- --port 4173 --strictPort
//   npx playwright test login-disabled
test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('hides the sign-in and personal-feed cards when no backend is configured', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()
  await page.getByRole('button', { name: 'You' }).first().click()
  await expect(page.getByText('Add-to-calendar button')).toBeVisible()

  // If the bundle was built WITH VITE_FAVORITES_API_URL the sign-in block shows;
  // the read-only path is inactive, so skip rather than fail.
  const loginEnabled = await page.getByText('Not signed in').isVisible().catch(() => false)
  test.skip(loginEnabled, 'bundle built with VITE_FAVORITES_API_URL — read-only path inactive')

  await expect(page.getByText('Not signed in')).toBeHidden()
  await expect(page.getByText(/Sign in to sync sources across devices/i)).toBeHidden()
  await expect(page.getByRole('button', { name: /Sign in/i })).toBeHidden()
  await expect(page.getByText(/single subscription link/i)).toBeHidden()
  // Read-only config still works.
  await expect(page.getByRole('button', { name: /Send feedback/i })).toBeVisible()

  await page.screenshot({ path: 'e2e/screenshots/you-login-disabled.png', fullPage: true })
})
