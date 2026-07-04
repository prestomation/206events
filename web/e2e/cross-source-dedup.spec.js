import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockDuplicateEvents } from './fixtures.js'
import { screenshotStable } from './screenshot.js'

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

  await screenshotStable(page, 'e2e/screenshots/event-detail-cross-source.png', { fullPage: true })
})

// js-joda-style local datetime N days out at 19:00 (matches map.spec helper).
function futureJoda(days, hour = 19) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
}

test('the map plots the canonical pin once and drops the suppressed duplicate', async ({ page }) => {
  // Isolated fixture: a canonical + its suppressed cross-source duplicate at the
  // SAME coordinate, 2 days out (in window). This asserts BOTH map filters, which
  // are separate code paths:
  //   - the rendered pins (EventsMap `isMappable`): if the suppressed copy were
  //     shown, the two same-coord markers would collapse into a 2-cluster icon;
  //     suppressed, there is exactly one plain marker and no cluster.
  //   - the live count badge (shell.jsx `shownCount`): reads "1 EVENTS", not 2.
  const date = futureJoda(2)
  const coord = { lat: 47.6235, lng: -122.3517 }
  const fixture = [
    {
      icsUrl: 'test-ripper-cal1.ics', summary: 'Live Aloha Hawaiian Cultural Festival',
      location: 'Seattle Center, 305 Harrison St, Seattle, WA 98109', date, ...coord,
      duplicateGroupId: 'g1', dedupedSources: ['test-ripper-cal2.ics'],
    },
    {
      icsUrl: 'test-ripper-cal2.ics', summary: 'Festal: Live Aloha Hawaiian Cultural Festival',
      location: 'Seattle Center', date, ...coord,
      duplicateGroupId: 'g1', duplicateOf: 'g1',
    },
  ]
  await page.route('**/events-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }))

  await page.goto('/')
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.events-map')).toBeVisible()

  // Rendered pins: exactly one plain marker, and NO cluster (a shown duplicate
  // would cluster the two same-coord markers into a `.cluster-icon` "2").
  await expect(map.locator('img.leaflet-marker-icon')).toHaveCount(1)
  await expect(map.locator('.cluster-icon')).toHaveCount(0)

  // Live count badge tracks the same suppression.
  await expect(page.locator('.a-mapbar .mk-tag').first()).toHaveText('1 EVENTS')

  await screenshotStable(page, 'e2e/screenshots/map-cross-source-dedup.png', { fullPage: true, expectMarkers: true })
})
