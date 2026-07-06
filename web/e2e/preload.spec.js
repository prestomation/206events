import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Guards the critical-path data preloads (docs/lighthouse-performance-plan.md
// Phase 1a): index.html preloads manifest.json and events-index-soon.json so
// they download in parallel with the JS bundle. A preload whose request mode /
// credentials don't match the app's fetch() is WORSE than none — the browser
// downloads the file twice. This spec pins the contract: each preloaded URL
// is requested exactly once per page load.

test('preloaded data files are fetched exactly once', async ({ page }) => {
  const counts = { manifest: 0, soon: 0 }
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.pathname.endsWith('/manifest.json')) counts.manifest += 1
    if (url.pathname.endsWith('/events-index-soon.json')) counts.soon += 1
  })

  await installDataMocks(page)
  await page.goto('/')

  // Wait until the app has consumed both payloads (mocked channels render
  // once manifest.json lands), then let in-flight requests settle so a
  // mismatched-preload duplicate would already have fired.
  await expect(page.getByText('Neumos')).toBeVisible()
  await page.waitForLoadState('networkidle')

  expect(counts.manifest, 'manifest.json fetched more than once — preload not consumed').toBe(1)
  expect(counts.soon, 'events-index-soon.json fetched more than once — preload not consumed').toBe(1)
})

test('index.html declares the data preloads', async ({ page }) => {
  await installDataMocks(page)
  await page.goto('/')
  const preloads = page.locator('link[rel="preload"][as="fetch"]')
  await expect(preloads).toHaveCount(2)
  const hrefs = await preloads.evaluateAll((els) => els.map((el) => el.getAttribute('href')))
  expect(hrefs).toContain('./manifest.json')
  expect(hrefs).toContain('./events-index-soon.json')
  // fetch() runs with same-origin credentials; the preload must carry
  // `crossorigin` (anonymous) to match, or the browser fetches twice.
  for (const el of await preloads.all()) {
    await expect(el).toHaveAttribute('crossorigin', /.*/)
  }
})
