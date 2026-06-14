import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockUncertainEvents } from './fixtures.js'

// Verifies the inline uncertainty badge — the structured replacement for the
// old raw "⚠️ Duration could not be verified against the source." description
// line. Also captures committed screenshots (per AGENTS.md "UI Changes" rule)
// so reviewers see the rendered badge for both kinds.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Override events-index with the uncertainty fixtures (kept out of the shared
  // mockEvents so other specs' counts are unaffected). Later route wins.
  await page.route('**/events-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUncertainEvents) }))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('shows a "pending" badge in the list and detail, and no raw ⚠️ note', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  // List row carries the compact (dot-only) badge.
  const pendingRow = page.locator('.ev', { hasText: 'Approximate Duration Show' })
  await expect(pendingRow).toBeVisible()
  await expect(pendingRow.locator('.uncertain-badge--pending')).toBeVisible()

  // Open the detail: the time chip badge reads "approximate".
  await pendingRow.click()
  const pendingBadge = page.locator('.uncertain-badge--pending').first()
  await expect(pendingBadge).toBeVisible()
  await expect(pendingBadge).toHaveAttribute('title', /approximate — being verified/)

  // The ugly raw note must NOT appear anywhere in the description.
  await expect(page.getByText(/could not be verified against the source/)).toHaveCount(0)
  await expect(page.getByText(/automated verification pending/)).toHaveCount(0)

  await page.screenshot({ path: 'e2e/screenshots/event-detail-uncertainty-pending.png', fullPage: true })
})

test('shows an "unverified" badge for unresolvable fields', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  const row = page.locator('.ev', { hasText: 'Unposted Details Show' })
  await expect(row).toBeVisible()
  await row.click()

  // startTime + cost are unresolvable → "unverified" badges on time and price.
  const badge = page.locator('.uncertain-badge--unresolvable').first()
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('title', /not posted by the source/)

  await page.screenshot({ path: 'e2e/screenshots/event-detail-uncertainty-unresolvable.png', fullPage: true })
})
