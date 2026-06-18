import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// When the feedback worker route isn't configured it returns HTTP 503; the modal
// then hands off to a GitHub "new issue" page with the user's type, message, and
// context prefilled (mirrors the no-backend path). We capture window.open instead
// of letting a real github.com tab spawn, so the suite stays hermetic.
test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Record the URL the app tries to open and suppress the real navigation.
  await page.addInitScript(() => {
    window.__opened = []
    window.open = (url) => { window.__opened.push(String(url)); return null }
  })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('hands off to a prefilled GitHub issue when feedback is not configured (503)', async ({ page }) => {
  // Worker is reachable but feedback isn't set up.
  await page.route('**/feedback', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Feedback is not configured"}' }))

  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()
  await page.getByRole('button', { name: 'You' }).first().click()

  // This bundle is built WITH VITE_FAVORITES_API_URL, so login is enabled and the
  // sign-in block is shown even when logged out (the inverse of the read-only
  // build, captured in you-login-disabled.png).
  await expect(page.getByText('Not signed in')).toBeVisible()
  await expect(page.getByText(/Sign in to sync sources across devices/i)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/you-login-enabled.png', fullPage: true })

  await page.getByRole('button', { name: /Send feedback/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('textbox').first().fill('Events are missing from this calendar')
  await page.screenshot({ path: 'e2e/screenshots/feedback-modal.png' })
  await dialog.getByRole('button', { name: 'Send' }).click()

  // The modal closed and we opened a prefilled GitHub new-issue URL.
  await expect(dialog).toBeHidden()
  const opened = await page.evaluate(() => window.__opened)
  expect(opened).toHaveLength(1)
  const url = new URL(opened[0])
  expect(url.pathname).toContain('/issues/new')
  expect(url.searchParams.get('title')).toContain('[Feedback]')
  expect(url.searchParams.get('labels')).toBe('feedback')
  expect(url.searchParams.get('body')).toContain('Events are missing from this calendar')
})
