import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// Exercises event navigation + outbound-link affordances across the three
// surfaces that show events (issue: event-page-navigation):
//   1. Event detail page — a prominent "View event page" button links to the
//      event's own URL (event.url).
//   2. Venue (channel) detail page — each event row carries a compact outbound
//      link icon (.ev-extlink) beside the add-to-calendar icon, not a
//      full-width button; the whole row still opens the event detail.
//   3. Main events list — clicking anywhere on a row opens the event detail,
//      while the venue chip still routes to the channel.
//
// Fixtures are kept local (route override) so other specs' event counts stay
// stable, per the AGENTS.md hermetic-suite rule.

function toJoda(date) {
  const p = (n) => String(n).padStart(2, '0')
  const off = -date.getTimezoneOffset()
  const s = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:00${s}${p(Math.floor(a / 60))}:${p(a % 60)}`
}
function icsStamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`
}
const future = (days, h = 19, m = 30) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(h, m, 0, 0)
  return d
}

const EVENT_URL = 'https://example.com/jazz-night'
const navEvents = [
  {
    icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night',
    description: 'Live jazz at the club.', location: 'Neumos, Capitol Hill',
    date: toJoda(future(2)), endDate: toJoda(future(2, 22)), lat: 47.61, lng: -122.32,
    url: EVENT_URL,
  },
  {
    icsUrl: 'test-ripper-cal1.ics', summary: 'Open Mic',
    description: 'Sign up at the door.', location: 'Neumos, Capitol Hill',
    date: toJoda(future(4)), lat: 47.61, lng: -122.32, url: 'https://example.com/open-mic',
  },
]

// A real VEVENT so the channel page renders parsed rows (the shared mock ICS is
// empty). URL property feeds the row's compact outbound-link icon.
const s = future(2); const e = future(2, 22); const s2 = future(4)
const navIcs = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:evt-jazz', 'SUMMARY:Jazz Night',
  `DTSTART:${icsStamp(s)}`, `DTEND:${icsStamp(e)}`,
  'LOCATION:Neumos, Capitol Hill', 'DESCRIPTION:Live jazz at the club.',
  `URL:${EVENT_URL}`, 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:evt-openmic', 'SUMMARY:Open Mic',
  `DTSTART:${icsStamp(s2)}`, 'LOCATION:Neumos, Capitol Hill', 'DESCRIPTION:Sign up at the door.',
  'URL:https://example.com/open-mic', 'END:VEVENT',
  'END:VCALENDAR',
].join('\n')

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  await overrideEventsIndex(page, navEvents)
  await page.route('**/*.ics', (r) => r.fulfill({ status: 200, contentType: 'text/calendar', body: navIcs }))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('event detail shows a "View event page" link to the source URL', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  await page.locator('.ev', { hasText: 'Jazz Night' }).first().click()

  const viewLink = page.getByRole('link', { name: 'View event page' })
  await expect(viewLink).toBeVisible()
  await expect(viewLink).toHaveAttribute('href', EVENT_URL)
  await expect(viewLink).toHaveAttribute('target', '_blank')

  await screenshotStable(page, 'e2e/screenshots/event-detail-view-event-page.png', { fullPage: true })
})

test('main events row: whole row opens the event; the venue chip opens the channel', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  const row = page.locator('.ev', { hasText: 'Jazz Night' }).first()
  await expect(row).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/main-events-list.png', { fullPage: true })

  // Clicking the row body (the title) opens the event detail.
  await row.locator('.ev-title').click()
  await expect(page.getByRole('link', { name: 'View event page' })).toBeVisible()

  // Reload to the list, then click the venue chip: it routes to the channel,
  // not the event. The channel page is identified by its unique CTA.
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()
  await page.locator('.ev', { hasText: 'Jazz Night' }).first().locator('.ev-chip').click()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toBeVisible()
})

// Where "back" lands from an event detail. The arrow should undo the step the
// reader actually took: from a venue page it returns to that venue, from the
// Discover list it returns to Discover. Browser Back has always done the former
// (it pops the hash); the in-app arrow used to clear both overlays and drop to
// the section regardless, so the two disagreed.
test('back from an event opened on a venue page returns to the venue', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Calendars', { exact: true }).first().click()
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()
  // The venue page is identified by its unique CTA.
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toBeVisible()

  await page.locator('.ev', { hasText: 'Jazz Night' }).first().locator('.ev-title').click()
  await expect(page.getByRole('link', { name: 'View event page' })).toBeVisible()

  await page.locator('.a-content .a-iconbtn').first().click()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View event page' })).toHaveCount(0)
})

test('back from an event opened in the Discover list returns to the list', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  await page.locator('.ev', { hasText: 'Jazz Night' }).first().locator('.ev-title').click()
  await expect(page.getByRole('link', { name: 'View event page' })).toBeVisible()

  await page.locator('.a-content .a-iconbtn').first().click()
  // Back on the events list — not on a venue page.
  await expect(page.locator('.ev', { hasText: 'Open Mic' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toHaveCount(0)
})

test('back still returns to the venue after hopping between events', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Calendars', { exact: true }).first().click()
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toBeVisible()

  await page.locator('.ev', { hasText: 'Jazz Night' }).first().locator('.ev-title').click()
  await expect(page.getByRole('link', { name: 'View event page' })).toBeVisible()

  // "More from this venue" hops sideways to another event without passing
  // through the venue page. The arrow still has to lead back out to it.
  await page.locator('.a-content .ev', { hasText: 'Open Mic' }).first().click()
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('Open+Mic')

  await page.locator('.a-content .a-iconbtn').first().click()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toBeVisible()
})

test('back from a venue page itself returns to the section, not to another venue', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Calendars', { exact: true }).first().click()
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toBeVisible()

  // Into an event and back to the venue, so a return target has been recorded
  // and consumed — the venue's own back arrow must not reuse it and loop.
  await page.locator('.ev', { hasText: 'Jazz Night' }).first().locator('.ev-title').click()
  await page.locator('.a-content .a-iconbtn').first().click()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toBeVisible()

  await page.locator('.a-content .a-iconbtn').first().click()
  await expect(page.locator('.ch', { hasText: 'Neumos' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add to my calendar app' })).toHaveCount(0)
})

test('venue page rows carry a compact outbound-link icon and still open the event', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Calendars', { exact: true }).first().click()
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()

  const row = page.locator('.ev', { hasText: 'Jazz Night' }).first()
  await expect(row).toBeVisible()

  // Compact outbound-link icon (not a full-width button) pointing at the source.
  const link = row.locator('a.ev-extlink')
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', EVENT_URL)
  await expect(link).toHaveAttribute('target', '_blank')

  await screenshotStable(page, 'e2e/screenshots/venue-detail-row-link-icon.png', { fullPage: true })

  // Clicking the row body (not the icon) still opens the event detail.
  await row.locator('.ev-title').click()
  await expect(page.getByRole('link', { name: 'View event page' })).toBeVisible()
})
