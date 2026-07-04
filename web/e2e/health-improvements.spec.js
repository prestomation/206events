import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// Exercises the Site Health improvements:
//   1. Clickable failure-class summary cards that open a raw-data detail panel.
//   2. A page-wide search filter that narrows every list + count.
//   3. The debug-mode toggle (persisted) and the per-object debug panels it
//      reveals on the venue (ChannelDetail) and event (EventDetail) pages.
//
// Fixtures are local (route override) per the AGENTS.md hermetic-suite rule.

// A rich build-errors document so every failure class has data to render.
// Static dates — the health page doesn't join these to the events index.
const richBuildErrors = {
  buildTime: '2026-03-10T17:00:00.000Z',
  totalErrors: 5,
  eventCounts: [
    { name: 'test-ripper-cal1', type: 'Ripper', events: 12, expectEmpty: false, source: 'test-ripper' },
    { name: 'test-ripper-cal2', type: 'Ripper', events: 0, expectEmpty: false, source: 'test-ripper' },
  ],
  sources: [
    { source: 'test-ripper', calendar: 'cal1', errorCount: 1, parseErrorCount: 1, uncertaintyCount: 0, errors: [{ type: 'ParseError', reason: 'bad row 7' }] },
  ],
  configErrors: [],
  externalCalendarFailures: [],
  geocodeErrors: [{ source: 'test-ripper', location: 'Mystery Venue', reason: 'not found' }],
  uncertainEvents: [{ source: 'test-ripper', event: { summary: 'TBD Show', date: '2026-03-20' }, unknownFields: ['startTime'] }],
  uncertaintyStats: { outstanding: 1, resolvedFromCache: 0, acknowledgedUnresolvable: 0 },
  geoStats: { totalEvents: 12, eventsWithGeo: 11, geocodeErrors: 1 },
  photoStats: { eventsWithImage: 9, totalEvents: 12, venuesWithImage: 0, totalVenues: 1, unresolvable: 0 },
  photoGaps: {
    venueGaps: [{ source: 'ripper', name: 'Neumos', label: 'Capitol Hill', mapUrl: 'https://maps.example/neumos' }],
    eventGaps: [{ source: 'test-ripper', eventId: 'e1', summary: 'Photoless Show', date: '2026-03-21' }],
  },
  costStats: { eventsWithCost: 4, freeEvents: 2, totalEvents: 12, unresolvable: 0 },
  costGaps: [{ source: 'test-ripper', eventId: 'e2', summary: 'Priceless Show', date: '2026-03-22' }],
  osmGaps: [{ source: 'ripper', name: 'Neumos', label: 'Capitol Hill', lat: 47.61, lng: -122.32 }],
  duplicateCandidates: [{
    key: 'dup1', score: { title: 0.9, distanceM: 15, locText: 0.8 },
    events: [{ icsUrl: 'a.ics', summary: 'Shared Gig', date: '2026-03-23' }, { icsUrl: 'b.ics', summary: 'Shared Gig', date: '2026-03-23' }],
  }],
  duplicateStats: { groups: 1, merged: 3, candidates: 1 },
  zeroEventCalendars: ['test-ripper-cal2'],
  expectedEmptyCalendars: [],
  unexpectedNonEmptyCalendars: [],
  pendingProxyVerification: [],
  proxyStaleServes: [],
  urlEntityErrors: [],
}

async function mockRichBuildErrors(page) {
  await page.route('**/build-errors.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(richBuildErrors),
  }))
}

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  await mockRichBuildErrors(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('summary cards are clickable and open the matching detail panel', async ({ page }) => {
  await page.goto('/#section=health')
  await expect(page.getByText('Source Health Dashboard')).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/health-dashboard-overview.png', { fullPage: true })

  // The "Missing Photos" card is a button that opens the photo panel.
  await page.getByRole('button', { name: /Missing Photos/ }).click()
  await expect(page.getByText(/Venue Photo Gaps/)).toBeVisible()
  await expect(page.getByText(/Event Photo Gaps/)).toBeVisible()
  await expect(page.getByText('Photoless Show — 2026-03-21')).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/health-photo-panel.png', { fullPage: true })

  // The "Duplicate Candidates" card opens the duplicates panel.
  await page.getByRole('button', { name: /Duplicate Candidates/ }).click()
  await expect(page.getByRole('heading', { name: /Duplicate Candidates/ })).toBeVisible()
  await expect(page.getByText(/Shared Gig/)).toBeVisible()
})

test('the search box filters every list and count on the page', async ({ page }) => {
  await page.goto('/#section=health')
  await expect(page.getByText('Source Health Dashboard')).toBeVisible()

  const input = page.getByLabel('Filter all health data')
  // Default Sources tab: narrow to a single calendar.
  await input.fill('cal2')
  await expect(page.getByText('test-ripper-cal2')).toBeVisible()
  await expect(page.getByText('test-ripper-cal1')).toHaveCount(0)
  await screenshotStable(page, 'e2e/screenshots/health-search-filter.png', { fullPage: true })

  // A non-matching query shows the empty state.
  await input.fill('zzz-no-match')
  await expect(page.getByText(/No sources match your search/)).toBeVisible()

  // Clear restores the full list.
  await page.getByRole('button', { name: /Clear filter/ }).click()
  await expect(page.getByText('test-ripper-cal1')).toBeVisible()
})

test('the debug-mode toggle flips on and persists', async ({ page }) => {
  await page.goto('/#section=health')
  const toggle = page.getByRole('switch', { name: /Debug mode/ })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await screenshotStable(page, 'e2e/screenshots/health-debug-toggle-on.png', { fullPage: true })

  // Persisted to localStorage so the detail pages pick it up.
  const stored = await page.evaluate(() => localStorage.getItem('calendar-ripper-debug'))
  expect(stored).toBe('1')
})

test.describe('debug panels (debug mode pre-enabled)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('calendar-ripper-debug', '1') } catch { /* ignore */ }
    })
  })

  test('venue page shows a source debug panel', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Calendars', { exact: true }).first().click()
    await page.locator('.ch', { hasText: 'Neumos' }).first().click()

    const panel = page.locator('.a-debug', { hasText: 'Debug · source' })
    await expect(panel).toBeVisible()
    // Joined from build-errors by source name (test-ripper).
    await expect(panel.getByText('1', { exact: false }).first()).toBeVisible()
    await expect(panel.getByText(/parse errors/)).toBeVisible()
    await expect(panel.getByText(/venue photo/)).toBeVisible()
    await screenshotStable(page, 'e2e/screenshots/debug-venue-panel.png', { fullPage: true })
  })

  test('event page shows an event debug panel', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Events', { exact: true }).first().click()
    await page.locator('.ev', { hasText: 'Jazz Night' }).first().click()

    const panel = page.locator('.a-debug', { hasText: 'Debug · event' })
    await expect(panel).toBeVisible()
    await expect(panel.getByText(/eventKey/)).toBeVisible()
    await expect(panel.getByText('Jazz Night|', { exact: false })).toBeVisible()
    await expect(panel.getByText(/coords/)).toBeVisible()
    await screenshotStable(page, 'e2e/screenshots/debug-event-panel.png', { fullPage: true })
  })
})
