import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockDuplicateEvents } from './fixtures.js'

// Verifies the web side of cross-source de-duplication: the build stamps
// `duplicateOf` on suppressed copies and `dedupedSources` on the canonical
// (lib/cross-source-dedup.ts); the UI hides the suppressed copy from lists and
// renders an "Also listed in" attribution on the canonical. Captures a
// committed screenshot per the AGENTS.md "UI Changes" rule.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  await page.route('**/events-index-soon.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDuplicateEvents) }))
  await page.route('**/events-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDuplicateEvents) }))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('hides the suppressed duplicate and shows the canonical once', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  // The canonical (cal1) appears exactly once; the suppressed cal2 copy
  // ("Festal: …") is filtered out of the list entirely.
  await expect(page.locator('.ev', { hasText: 'Live Aloha Hawaiian Cultural Festival' })).toHaveCount(1)
  await expect(page.locator('.ev', { hasText: 'Festal:' })).toHaveCount(0)
})

test('shows "Also listed in" attribution on the canonical event', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  await page.locator('.ev', { hasText: 'Live Aloha Hawaiian Cultural Festival' }).first().click()

  const attribution = page.locator('.a-dedup-sources')
  await expect(attribution).toBeVisible()
  await expect(attribution).toContainText('Also listed in:')
  // cal2's channel friendly name is "SIFF" (see fixtures mockManifest).
  await expect(attribution.getByText('SIFF')).toBeVisible()

  await page.screenshot({ path: 'e2e/screenshots/event-detail-cross-source.png', fullPage: true })
})
