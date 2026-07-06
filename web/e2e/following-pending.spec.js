import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// Saved-search matching runs asynchronously (in the search worker) and its
// match sets land a beat after the Following feed first paints — Fix 3 of
// docs/following-tab-performance.md makes that wait visible: a status row
// ("Matching your N saved searches…") plus a spinner on the legend's search
// chip, cleared when the matches merge into the feed.
//
// Determinism: the matching resolves in single-digit ms against the small
// fixture corpus, so the pending state can't be caught from timing alone.
// Instead the spec removes `Worker` (the app's supported main-thread fallback,
// exercised in-browser by search-worker-fallback.spec.js — the pending UX code
// is identical on both paths) and GATES the lazy searchEngine chunk request:
// every searchClient.search() promise stays pending until the gate opens, the
// same hold-the-response pattern payload-split.spec.js uses.

test.beforeEach(async ({ page }) => {
  // Force the main-thread search fallback BEFORE any app script runs.
  await page.addInitScript(() => {
    try { delete window.Worker } catch { /* non-configurable: best effort */ }
    // eslint-disable-next-line no-global-assign
    window.Worker = undefined
  })
  await installDataMocks(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('Following shows a pending row while saved searches match, then merges the matches', async ({ page }) => {
  // Gate the search engine chunk. The fallback client's search() awaits this
  // dynamic import, so saved-search matching stays in flight until release.
  let releaseEngine
  const engineGate = new Promise((resolve) => { releaseEngine = resolve })
  let engineRequested = false
  await page.route('**/assets/searchEngine-*.js', async (route) => {
    engineRequested = true
    await engineGate
    await route.continue()
  })

  // Seed personalization client-side (signed-out localStorage — the identical
  // perFilterMatches / followingGroups code path a signed-in list takes):
  // one followed calendar and two saved searches. "premiere" matches the
  // cal2 fixture event, which is NOT followed — it can only enter the feed
  // through the saved search.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('calendar-ripper-favorites', JSON.stringify(['test-ripper-cal1.ics']))
      localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(['premiere', 'poetry slam']))
    } catch { /* ignore */ }
  })

  await page.goto('/')
  await page.getByText('Following', { exact: true }).first().click()

  // The feed paints immediately from the followed calendar…
  await expect(page.locator('.ev', { hasText: 'Jazz Night' })).toBeVisible()
  // …while the matching is still pending: status row + chip spinner shown,
  // and the search-matched event hasn't joined yet.
  const pending = page.locator('.a-feedpending')
  await expect(pending).toBeVisible()
  await expect(pending).toContainText('Matching your 2 saved searches')
  await expect(page.locator('.a-feedlegend .a-feedpending-spin')).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Movie Premiere' })).toHaveCount(0)
  expect(engineRequested, 'the engine chunk request was gated').toBe(true)
  await screenshotStable(page, 'e2e/screenshots/following-pending-matching.png', { fullPage: false })

  // Open the gate: matching completes, the matched event merges into the
  // feed, and the pending row + chip spinner clear.
  releaseEngine()
  await expect(page.locator('.ev', { hasText: 'Movie Premiere' })).toBeVisible()
  await expect(pending).toHaveCount(0)
  await expect(page.locator('.a-feedlegend .a-feedpending-spin')).toHaveCount(0)
  await screenshotStable(page, 'e2e/screenshots/following-pending-settled.png', { fullPage: false })
})

test('no pending row without saved searches', async ({ page }) => {
  // Favorites only — the pending row is strictly a saved-search affordance.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('calendar-ripper-favorites', JSON.stringify(['test-ripper-cal1.ics']))
    } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.getByText('Following', { exact: true }).first().click()
  await expect(page.locator('.ev', { hasText: 'Jazz Night' })).toBeVisible()
  await expect(page.locator('.a-feedpending')).toHaveCount(0)
})
