import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockBuildErrors } from './fixtures.js'
import { screenshotStable } from './screenshot.js'

// Verifies that build-errors.json is NOT fetched on regular page load, only
// when the user navigates to the health section. This covers the lazy-load
// optimization (issue #648).

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('does not fetch build-errors.json on regular page load', async ({ page }) => {
  const buildErrorsRequests = []
  page.on('request', (req) => {
    if (req.url().includes('build-errors.json')) buildErrorsRequests.push(req.url())
  })

  await page.goto('/')
  // Wait for the app to finish loading (channels visible means data loaded)
  await expect(page.getByText('Neumos')).toBeVisible()

  expect(buildErrorsRequests, 'build-errors.json must not be fetched on page load').toHaveLength(0)
})

test('fetches build-errors.json and renders the health dashboard when navigating to #section=health', async ({ page }) => {
  const buildErrorsRequests = []
  page.on('request', (req) => {
    if (req.url().includes('build-errors.json')) buildErrorsRequests.push(req.url())
  })

  // Override build-errors with a fixture that has a recognizable buildTime
  await page.route('**/build-errors.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...mockBuildErrors, buildTime: '2026-01-15T17:00:00.000Z', eventCounts: [] }),
    })
  )

  await page.goto('/#section=health')
  await expect(page.getByText('Source Health Dashboard')).toBeVisible()

  // The build time from our fixture should appear once the fetch resolves. Wait
  // for it before asserting the request count: the heading above renders in the
  // pre-fetch loading state, so the count is only stable after the data lands.
  await expect(page.getByText(/1\/15\/2026/)).toBeVisible()

  // build-errors.json must have been fetched exactly once
  expect(buildErrorsRequests).toHaveLength(1)

  await screenshotStable(page, 'e2e/screenshots/health-dashboard.png')
})
