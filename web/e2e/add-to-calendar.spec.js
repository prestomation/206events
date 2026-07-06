import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// Regression test for the AddToCalendar UTC-offset bug:
// js-joda emits seconds-less ISO strings like "2026-06-18T17:00-07:00[America/Los_Angeles]"
// when seconds are 0. Safari misparses these by ignoring the UTC offset, treating
// the time as UTC (5 PM UTC = 10 AM PDT instead of 5 PM PDT = midnight UTC).
// parseIndexDate normalizes to always include ":00" seconds before calling new Date(),
// so the UTC offset is unambiguous and the AddToCalendar link uses the right time.
//
// The producer (calendar_ripper.ts) now also emits seconds via zdtToIndexDate(),
// but the consumer fix stays as defense-in-depth for any cached or older data.

// Compute a fixture date 60 days from now (UTC-based arithmetic, CI-timezone safe).
// The -07:00 PDT offset is hardcoded to simulate a typical Seattle summer event.
// 5 PM PDT = 17:00-07:00 = 00:00 UTC on the following calendar day.
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 60))
const ty = target.getUTCFullYear()
const tm = pad(target.getUTCMonth() + 1)
const td = pad(target.getUTCDate())
// Seconds-less format — the shape js-joda used to emit when second==0
const NIGHT_MARKET_DATE = `${ty}-${tm}-${td}T17:00-07:00[America/Los_Angeles]`
// 17:00-07:00 = 00:00 UTC on the next calendar day
const utcDay = new Date(target.getTime() + 24 * 3600 * 1000)
const uy = utcDay.getUTCFullYear()
const um = pad(utcDay.getUTCMonth() + 1)
const ud = pad(utcDay.getUTCDate())
const EXPECTED_UTC_START = `${uy}${um}${ud}T000000Z`  // correct: 5 PM PDT = midnight UTC
// No endDate in fixture → AddToCalendar falls back to startDate + 1 hour = T01:00:00Z
const EXPECTED_UTC_END   = `${uy}${um}${ud}T010000Z`

const nightMarketFixture = [
  {
    icsUrl: 'test-ripper-cal1.ics',
    summary: 'Night Market Test Event',
    description: 'Test event for the AddToCalendar UTC-offset fix.',
    location: 'Pike Place Market, Seattle, WA',
    date: NIGHT_MARKET_DATE,
    lat: 47.608,
    lng: -122.340,
  },
]

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)

  // Override the events corpus with our seconds-less fixture.
  // Later route() registration wins in Playwright (LIFO).
  await overrideEventsIndex(page, nightMarketFixture)

  // Force Google Calendar mode so AddToCalendar renders an <a href> we can
  // inspect. Desktop "auto" mode defaults to .ics (a download button with no href).
  await page.addInitScript(() => {
    try { localStorage.setItem('calendar-ripper-add-mode', 'google') } catch {}
  })

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('AddToCalendar Google link carries the correct UTC timestamp for a seconds-less ISO date', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  // Open the event detail by clicking the row.
  const row = page.locator('.ev', { hasText: 'Night Market Test Event' })
  await expect(row).toBeVisible()
  await row.click()

  // The labeled "Add to calendar" button in the event detail has class add-to-cal-full.
  // In Google Calendar mode it is an <a> with an href we can assert.
  const addBtn = page.locator('.add-to-cal-full')
  await expect(addBtn).toBeVisible()

  const href = await addBtn.getAttribute('href')
  expect(href).toContain('calendar.google.com')
  // 5 PM PDT = midnight UTC next day — NOT 5 PM UTC (= 10 AM PDT, the Safari bug).
  expect(href).toContain(EXPECTED_UTC_START)
  expect(href).toContain(EXPECTED_UTC_END)

  await screenshotStable(page, 'e2e/screenshots/add-to-calendar-correct-time.png', { fullPage: true })
})
