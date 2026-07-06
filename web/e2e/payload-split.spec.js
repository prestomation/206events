import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockEventsSoon, mockEventsFull, streamPairFor } from './fixtures.js'
import { screenshotStable } from './screenshot.js'

// Verifies the phased events load: the small "soon" payload paints the
// near-term events immediately, then the full corpus streams in behind it
// (`events-index.ndjson` + lazy `event-descriptions.json` — see
// docs/event-payload-scaling.md) to unlock the whole timeline. While the
// stream is still in flight, an active search shows a "Loading all events…"
// hint and only covers the near-term window; once it lands, far-future events
// become searchable. A second test proves the fallback: deploys without the
// NDJSON files still load via the monolithic events-index.json.

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test('renders the soon payload first, then streams the full corpus behind it', async ({ page }) => {
  await installDataMocks(page)

  // Gate the NDJSON stream so the in-between state is observable
  // deterministically (no reliance on wall-clock timing). The route resolves
  // only when the test calls releaseFull().
  let releaseFull
  const fullGate = new Promise((resolve) => { releaseFull = resolve })
  const streamPair = streamPairFor(mockEventsFull)

  await page.route('**/events-index-soon.json', (route) => route.fulfill(json(mockEventsSoon)))
  await page.route('**/events-index.ndjson', async (route) => {
    await fullGate
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: streamPair.ndjson })
  })
  await page.route('**/event-descriptions.json', (route) => route.fulfill(json(streamPair.descriptions)))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  const monolithicRequests = []
  page.on('request', (req) => {
    if (/events-index\.json(\?|$)/.test(req.url())) monolithicRequests.push(req.url())
  })

  await page.goto('/')
  // Switch Discover into Events mode.
  await page.getByText('Events', { exact: true }).first().click()

  // Phase 1: the near-term event from the soon payload is visible; the
  // far-future event (present only in the full corpus) is not yet.
  await expect(page.locator('.ev', { hasText: 'Soon Jazz Show' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Far Future Fest' })).toHaveCount(0)

  // Search for the far-future event while the stream is still gated: the
  // "loading all events" hint appears and there's no match yet.
  await page.locator('.a-search-input').fill('Far Future')
  await expect(page.locator('.a-search-loading')).toBeVisible()
  await expect(page.locator('.a-search-loading')).toContainText('Loading all events')
  await expect(page.locator('.ev', { hasText: 'Far Future Fest' })).toHaveCount(0)
  await screenshotStable(page, 'e2e/screenshots/payload-split-loading.png', { fullPage: true })

  // Phase 2: release the stream. The hint clears and the far-future event
  // becomes searchable.
  releaseFull()
  await expect(page.locator('.a-search-loading')).toHaveCount(0)
  await expect(page.locator('.ev', { hasText: 'Far Future Fest' })).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/payload-split-loaded.png', { fullPage: true })

  // The whole flow ran on the stream — the monolithic fallback never fired.
  expect(monolithicRequests, 'no fallback to events-index.json').toEqual([])
  expect(pageErrors, 'no uncaught page errors').toEqual([])
})

test('descriptions arrive lazily from the dictionary and reach the event detail view', async ({ page }) => {
  await installDataMocks(page)

  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  // Open the Jazz Night detail; its description ships only via the dictionary
  // (the default mocks strip descriptions into event-descriptions.json), so
  // seeing the text proves the d-ref → dictionary enrichment end to end.
  await page.locator('.ev', { hasText: 'Jazz Night' }).first().click()
  await expect(page.getByText('Live jazz')).toBeVisible()
})

test('falls back to the monolithic events-index.json when the stream files are absent', async ({ page }) => {
  await installDataMocks(page)

  // Simulate an older deploy: the NDJSON pair 404s; the monolithic file (still
  // served by installDataMocks) must carry the full corpus instead.
  await page.route('**/events-index.ndjson', (route) => route.fulfill({ status: 404, body: 'not found' }))
  await page.route('**/event-descriptions.json', (route) => route.fulfill({ status: 404, body: 'not found' }))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  await expect(page.locator('.ev', { hasText: 'Jazz Night' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Movie Premiere' })).toBeVisible()

  // Search still works over the monolithic corpus (descriptions inline).
  await page.locator('.a-search-input').fill('film')
  await expect(page.locator('.ev', { hasText: 'Movie Premiere' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Jazz Night' })).toHaveCount(0)

  expect(pageErrors, 'no uncaught page errors').toEqual([])
})
