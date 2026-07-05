import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockManifest } from './fixtures.js'
import { screenshotStable } from './screenshot.js'

// Infinite scroll + offline recovery for the Discover "Events" list.
//
// The list used to render a hard `slice(0, 200)` with no affordance — it just
// stopped, reading as "nothing else exists." EventsMode now pages through the
// full filtered set with an IntersectionObserver and shows an explicit
// end-of-list marker. Separately, an offline boot that only lands the near-term
// "soon" subset now retries the full index on reconnect.
//
// These specs override the events routes with their own large/split fixtures and
// re-route inside the test so the shared specs' event counts stay stable.

// js-joda-style timestamp: "2026-02-15T19:00:00-08:00".
function toJoda(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// 150 events, one every 2 hours starting 2h from now, so they span ~12 days
// (multiple day groups) and comfortably exceed the 60-event page size. Titles
// are zero-padded + `#`-prefixed so "Event #149" never substring-matches another.
const TOTAL = 150
function makeEvents(n = TOTAL) {
  const base = Date.now()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base + (i + 1) * 2 * 3600 * 1000)
    return {
      icsUrl: 'test-ripper-cal1.ics',
      summary: `Event #${String(i).padStart(3, '0')}`,
      description: `Event number ${i}`,
      location: 'Neumos, Capitol Hill',
      date: toJoda(d),
    }
  })
}

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function gotoEvents(page) {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()
}

test('pages through the full events list on scroll and marks the end', async ({ page }) => {
  await installDataMocks(page)
  const events = makeEvents()
  await page.route('**/events-index-soon.json', (route) => route.fulfill(json(events)))
  await page.route('**/events-index.json', (route) => route.fulfill(json(events)))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await gotoEvents(page)

  // First page renders the soonest events; the last event is NOT in the DOM yet.
  await expect(page.getByText('Event #000', { exact: true })).toBeVisible()
  await expect(page.getByText('Event #149', { exact: true })).toHaveCount(0)
  // The "more" sentinel is present (there are more events in memory), not the
  // terminal end-of-list marker.
  await expect(page.locator('.a-listmore')).toBeVisible()
  await expect(page.locator('.a-listend')).toHaveCount(0)
  await screenshotStable(page, 'e2e/screenshots/events-pagination-loading.png', { fullPage: false })

  // Scroll the content container to the bottom repeatedly. Each pass pulls the
  // sentinel into view and appends another page until the whole list is
  // rendered and the terminal marker appears.
  const content = page.locator('.a-content')
  await expect(async () => {
    await content.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(page.locator('.a-listend')).toBeVisible()
  }).toPass({ timeout: 15000 })

  // Every event is now reachable, including the last, and the marker states the
  // true total.
  await expect(page.getByText('Event #149', { exact: true })).toBeVisible()
  await expect(page.locator('.a-listend')).toContainText(`That’s all ${TOTAL} events`)
  await expect(page.locator('.a-listmore')).toHaveCount(0)
  await page.locator('.a-listend').scrollIntoViewIfNeeded()
  await screenshotStable(page, 'e2e/screenshots/events-pagination-end.png', { fullPage: false })

  expect(pageErrors, 'no uncaught page errors').toEqual([])
})

test('retries the full events index when connectivity returns', async ({ page }) => {
  await installDataMocks(page)

  // The soon payload has only a near-term event; the full index (which alone
  // carries the far-future event) fails on the first request and succeeds on
  // the retry — standing in for an offline boot followed by a reconnect.
  const now = Date.now()
  const soon = [{
    icsUrl: 'test-ripper-cal1.ics', summary: 'Near Term Show',
    description: 'Soon', location: 'Neumos, Capitol Hill',
    date: toJoda(new Date(now + 3 * 3600 * 1000)),
  }]
  const full = [
    ...soon,
    {
      icsUrl: 'test-ripper-cal2.ics', summary: 'Far Future Fest',
      description: 'Later', location: 'SIFF',
      date: toJoda(new Date(now + 10 * 24 * 3600 * 1000)),
    },
  ]

  await page.route('**/events-index-soon.json', (route) => route.fulfill(json(soon)))
  let fullAttempts = 0
  await page.route('**/events-index.json', (route) => {
    fullAttempts += 1
    if (fullAttempts === 1) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'offline' })
    return route.fulfill(json(full))
  })

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await gotoEvents(page)

  // Full index failed: only the near-term event is present.
  await expect(page.getByText('Near Term Show', { exact: true })).toBeVisible()
  await expect(page.getByText('Far Future Fest', { exact: true })).toHaveCount(0)

  // Simulate coming back online — the reconnect handler retries the full index.
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  // The far-future event streams in without a reload.
  await expect(page.getByText('Far Future Fest', { exact: true })).toBeVisible()
  expect(fullAttempts, 'full index re-fetched on reconnect').toBeGreaterThanOrEqual(2)

  expect(pageErrors, 'no uncaught page errors').toEqual([])
})
