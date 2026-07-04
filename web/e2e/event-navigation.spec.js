import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
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
  const body = JSON.stringify(navEvents)
  await page.route('**/events-index-soon.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body }))
  await page.route('**/events-index.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body }))
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
