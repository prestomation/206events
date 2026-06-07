import { test, expect } from '@playwright/test'
import { installDataMocks, installLoggedInMocks } from './mock-routes.js'

// Multi-list (signed-in) e2e. The logged-out default suite lives in app.spec.js;
// here we stub auth/me + /lists so the app boots signed-in with two lists. This
// requires the bundle to be built with VITE_FAVORITES_API_URL set (see
// playwright.config.js); when it isn't, the app stays logged out and these
// assertions are skipped via the guard below.
test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  await installLoggedInMocks(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

async function gotoYouSignedIn(page) {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()
  await page.getByRole('button', { name: 'You' }).first().click()
  // Signed-in account card shows the user name. If the bundle was built without
  // VITE_FAVORITES_API_URL the app stays logged out — skip rather than fail.
  const signedIn = await page.getByText('Test User').isVisible().catch(() => false)
  test.skip(!signedIn, 'bundle built without VITE_FAVORITES_API_URL — signed-in path inactive')
}

test('shows a list switcher and swaps the feed URL when switching lists', async ({ page }) => {
  await gotoYouSignedIn(page)

  await expect(page.getByRole('tab', { name: 'My Favorites' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Date Night' })).toBeVisible()
  await expect(page.getByText('https://api.test/feed/tok1.ics')).toBeVisible()

  await page.getByRole('tab', { name: 'Date Night' }).click()
  await expect(page.getByText('https://api.test/feed/tok2.ics')).toBeVisible()
})

test('offers create / rename / delete controls for lists', async ({ page }) => {
  await gotoYouSignedIn(page)
  await expect(page.getByRole('button', { name: 'New list' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete list' })).toBeVisible()
})
