import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockEventsSoon, mockEventsFull } from './fixtures.js'

// Verifies the two-phase events load (issue 649): the small "soon" payload
// paints the near-term events immediately, then the full index streams in
// behind it to unlock the whole timeline. While the full index is still in
// flight, an active search shows a "Loading all events…" hint and only covers
// the near-term window; once it lands, far-future events become searchable.

test('renders the soon payload first, then loads the full index behind it', async ({ page }) => {
  await installDataMocks(page)

  // Gate the full index so the in-between state is observable deterministically
  // (no reliance on wall-clock timing). The route resolves only when the test
  // calls releaseFull().
  let releaseFull
  const fullGate = new Promise((resolve) => { releaseFull = resolve })
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/events-index-soon.json', (route) => route.fulfill(json(mockEventsSoon)))
  await page.route('**/events-index.json', async (route) => {
    await fullGate
    await route.fulfill(json(mockEventsFull))
  })

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await page.goto('/')
  // Switch Discover into Events mode.
  await page.getByText('Events', { exact: true }).first().click()

  // Phase 1: the near-term event from the soon payload is visible; the
  // far-future event (present only in the full index) is not yet.
  await expect(page.locator('.ev', { hasText: 'Soon Jazz Show' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Far Future Fest' })).toHaveCount(0)

  // Search for the far-future event while the full index is still gated: the
  // "loading all events" hint appears and there's no match yet.
  await page.locator('.a-search-input').fill('Far Future')
  await expect(page.locator('.a-search-loading')).toBeVisible()
  await expect(page.locator('.a-search-loading')).toContainText('Loading all events')
  await expect(page.locator('.ev', { hasText: 'Far Future Fest' })).toHaveCount(0)
  await page.screenshot({ path: 'e2e/screenshots/payload-split-loading.png', fullPage: true })

  // Phase 2: release the full index. The hint clears and the far-future event
  // becomes searchable.
  releaseFull()
  await expect(page.locator('.a-search-loading')).toHaveCount(0)
  await expect(page.locator('.ev', { hasText: 'Far Future Fest' })).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/payload-split-loaded.png', fullPage: true })

  expect(pageErrors, 'no uncaught page errors').toEqual([])
})
