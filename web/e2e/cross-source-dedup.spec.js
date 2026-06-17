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
  // Isolated, all-in-window fixture: a canonical + suppressed duplicate pair
  // plus one unrelated event, all coord-bearing and 2 days out. The desktop map
  // panel renders a live "<n> EVENTS" badge counting plotted pins. The suppressed
  // copy (`duplicateOf` set) must not add a pin, so the badge reads 2, not 3.
  const date = futureJoda(2)
  const fixture = [
    {
      icsUrl: 'test-ripper-cal1.ics', summary: 'Live Aloha Hawaiian Cultural Festival',
      location: 'Seattle Center, 305 Harrison St, Seattle, WA 98109', date, lat: 47.6235, lng: -122.3517,
      duplicateGroupId: 'g1', dedupedSources: ['test-ripper-cal2.ics'],
    },
    {
      icsUrl: 'test-ripper-cal2.ics', summary: 'Festal: Live Aloha Hawaiian Cultural Festival',
      location: 'Seattle Center', date, lat: 47.6250, lng: -122.3517,
      duplicateGroupId: 'g1', duplicateOf: 'g1',
    },
    { icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night', location: 'Neumos, Capitol Hill', date, lat: 47.61, lng: -122.32 },
  ]
  await page.route('**/events-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }))

  await page.goto('/')
  // Desktop map panel's live count badge: 2 pins (canonical + Jazz), not 3.
  const countBadge = page.locator('.a-mapbar .mk-tag').first()
  await expect(countBadge).toHaveText('2 EVENTS')

  await page.screenshot({ path: 'e2e/screenshots/map-cross-source-dedup.png', fullPage: true })
})
