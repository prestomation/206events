import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockManifest } from './fixtures.js'

// Red/green regression test for event-list scroll restoration.
//
// Repro of the reported bug: scroll part-way down the Discover → Events list,
// open an event for details, then hit back to keep browsing. The list should
// return to where you left off — but today the `.a-content` scroll container
// carries a `key` that flips between the section view and the event overlay
// (App206.jsx), so React remounts it on back-nav and the scroll position is
// reset to the top.
//
// This test is RED against the current code (restored scrollTop ≈ 0) and turns
// GREEN once the back-navigation preserves/restores the list scroll position.

// js-joda-style timestamp, e.g. "2026-02-15T19:00:00-08:00".
function toJoda(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// A long, deterministic events list — one event per upcoming day — so there is
// plenty to scroll. All events ride cal1 (Neumos), which exists in the manifest
// and carries coordinates, so the rows render fully.
function makeManyEvents(n) {
  const events = []
  for (let i = 1; i <= n; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(19, 30, 0, 0)
    events.push({
      icsUrl: 'test-ripper-cal1.ics',
      summary: `Concert ${String(i).padStart(2, '0')}`,
      description: `Show number ${i}`,
      location: 'Neumos, Capitol Hill',
      date: toJoda(d),
      lat: 47.61,
      lng: -122.32,
    })
  }
  return events
}

// Per-page uncaught-error buckets, keyed off the Playwright page so we don't
// monkey-patch custom properties onto it (which risks colliding with internal
// Playwright fields).
const pageErrorsByPage = new WeakMap()

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Override the events feed with a list long enough to scroll. Re-registering
  // the route takes precedence over the default two-event mock.
  await page.route('**/events-index.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeManyEvents(60)),
    }))

  const pageErrors = []
  pageErrorsByPage.set(page, pageErrors)
  page.on('pageerror', (err) => pageErrors.push(err))
})

test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page) ?? [], 'no uncaught page errors').toEqual([])
})

test('event list keeps its scroll position after opening details and going back', async ({ page }) => {
  // Sanity: the manifest still describes cal1, so the fixtures stay coherent.
  expect(mockManifest.rippers[0].calendars[0].icsUrl).toBe('test-ripper-cal1.ics')

  await page.goto('/')
  // Wait past the boot splash.
  await expect(page.getByText('Neumos').first()).toBeVisible()

  // Switch Discover into Events mode so the day-grouped event list renders.
  await page.getByText('Events', { exact: true }).first().click()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  const content = page.locator('.a-content')
  const scrollTopOf = () => content.evaluate((el) => el.scrollTop)

  // Browse down: center a row that lives well below the fold. This scrolls the
  // content container (not the window) and leaves the target row in view so the
  // subsequent click won't auto-scroll and perturb the saved position.
  const target = page.locator('.a-content .ev').nth(30)
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))

  const savedScroll = await scrollTopOf()
  expect(savedScroll, 'list should be scrolled away from the top').toBeGreaterThan(100)

  // Open the event for details.
  await target.click()
  // Detail view is up: the back button (the only .a-iconbtn inside the content
  // column) is visible.
  const backBtn = page.locator('.a-content .a-iconbtn').first()
  await expect(backBtn).toBeVisible()

  // Go back to continue browsing.
  await backBtn.click()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  // The list should resume approximately where we left off — not jump to the
  // top (the bug) and not overshoot to some other position. Bound both sides so
  // a future regression that lands at the bottom can't masquerade as a pass.
  const TOLERANCE = 50
  await expect
    .poll(() => scrollTopOf(), {
      message: 'scroll position should be restored after back-navigation',
      timeout: 5000,
    })
    .toBeGreaterThanOrEqual(savedScroll - TOLERANCE)

  const restoredScroll = await scrollTopOf()
  expect(restoredScroll, 'scroll position should not overshoot the saved place')
    .toBeLessThanOrEqual(savedScroll + TOLERANCE)
})
