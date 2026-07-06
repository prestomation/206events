import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// The Following feed carries the same Google-Photos-style day scrubber as the
// Discover "Events" list (both render through the shared PagedDayList), and pages
// its feed a screenful at a time. These specs seed a dense multi-week feed via
// favorites, open Following, and exercise the handle there.
//
// They supply their own fixture and re-route inside the test so the shared
// specs' counts stay stable.

// js-joda-style timestamp: "2026-02-15T19:00:00-08:00".
function toJoda(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// A dense multi-week fixture: `PER_DAY` events on each of `nDays` days starting
// tomorrow. At 3/day the far days push well past the first 60-event page, so the
// "seek loads an unrendered day" assertion holds. All events belong to the
// calendar we favorite below so the entire fixture becomes the feed.
const FEED_ICS = 'test-ripper-cal1.ics'
const PER_DAY = 3
const DAYS = 40
function makeEvents(nDays = DAYS) {
  const base = new Date()
  base.setHours(12, 0, 0, 0)
  const out = []
  for (let day = 0; day < nDays; day++) {
    for (let k = 0; k < PER_DAY; k++) {
      const d = new Date(base)
      d.setDate(base.getDate() + day + 1)
      d.setHours(12 + k * 2)
      out.push({
        icsUrl: FEED_ICS,
        summary: `Day ${String(day).padStart(2, '0')} Show ${k}`,
        description: `Event on day ${day}`,
        location: 'Neumos, Capitol Hill',
        date: toJoda(d),
      })
    }
  }
  return out
}

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function routeEvents(page, events) {
  await page.route('**/events-index-soon.json', (route) => route.fulfill(json(events)))
  await page.route('**/events-index.json', (route) => route.fulfill(json(events)))
}

// Start signed-out with the feed calendar already favorited (client-side
// localStorage), then open the Following view.
async function gotoFollowing(page, events = makeEvents()) {
  await installDataMocks(page)
  await routeEvents(page, events)
  await page.addInitScript((ics) => {
    try { localStorage.setItem('calendar-ripper-favorites', JSON.stringify([ics])) } catch { /* ignore */ }
  }, FEED_ICS)
  await page.goto('/')
  await page.getByText('Following', { exact: true }).first().click()
  await expect(page.getByText('Day 00 Show 0', { exact: true })).toBeVisible()
}

test('the scrubber handle is a date slider on the Following feed', async ({ page }) => {
  await gotoFollowing(page)

  const handle = page.getByRole('slider', { name: 'Date scrubber' })
  await expect(handle).toBeVisible()
  await expect(handle).toHaveAttribute('aria-valuetext', /.+/)

  // Hovering reveals the track + date bubble (the resting affordance).
  await handle.hover()
  await expect(page.locator('.a-scrubber-bubble')).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/following-scrubber-idle.png', { fullPage: false })
})

test('dragging the handle jumps the Following feed to a later day', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await gotoFollowing(page)
  // A far day is not rendered in the first page.
  await expect(page.getByText('Day 38 Show 0', { exact: true })).toHaveCount(0)

  const handle = page.getByRole('slider', { name: 'Date scrubber' })
  const track = page.locator('.a-scrubber')
  const tb = await track.boundingBox()
  const hb = await handle.boundingBox()

  // Grab the handle and drag down. The list scrolls LIVE while the button is
  // still down, and a far day that wasn't in the first page comes into view.
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height * 0.55, { steps: 12 })
  await expect(page.locator('.a-scrubber-bubble')).toBeVisible()
  await expect
    .poll(async () => page.locator('.a-content').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0)
  await screenshotStable(page, 'e2e/screenshots/following-scrubber-drag.png', { fullPage: false })
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height * 0.9, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByText('Day 38 Show 0', { exact: true })).toBeVisible()
  const scrollTop = await page.locator('.a-content').evaluate((el) => el.scrollTop)
  expect(scrollTop, 'feed scrolled down after the drag').toBeGreaterThan(0)

  expect(pageErrors, 'no uncaught page errors').toEqual([])
})

test('keyboard moves the Following scrubber to the end of the timeline', async ({ page }) => {
  await gotoFollowing(page)

  const handle = page.getByRole('slider', { name: 'Date scrubber' })
  await handle.focus()
  await handle.press('End')

  // End jumps to the last day; its event renders (proving the paged feed grew
  // far enough to include an otherwise-unrendered day).
  await expect(page.getByText('Day 39 Show 0', { exact: true })).toBeVisible()
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThanOrEqual(DAYS - 6)
})

test('no scrubber for a short Following feed', async ({ page }) => {
  // Two days only — below the scrubber threshold, so it stays hidden.
  await gotoFollowing(page, makeEvents(2))
  await expect(page.getByRole('slider', { name: 'Date scrubber' })).toHaveCount(0)
})
