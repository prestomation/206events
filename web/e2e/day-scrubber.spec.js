import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// Google-Photos-style day scrubber for the Discover "Events" list. A handle
// pinned to the right edge of the scroll viewport lets the reader jump to a
// specific day: grabbing it reveals a date bubble, and releasing (or using the
// keyboard) scrolls the list to that day — growing the paged list far enough to
// include days that weren't rendered yet.
//
// These specs supply their own multi-week fixture and re-route inside the test
// so the shared specs' counts stay stable.

// js-joda-style timestamp: "2026-02-15T19:00:00-08:00".
function toJoda(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// A dense multi-week fixture: `PER_DAY` events on each of `nDays` days starting
// tomorrow (local noon). Density matters — one event per day would fit the whole
// span inside the first 60-event page, so the far days would already be rendered
// and the "seek loads an unrendered day" assertion couldn't hold. At 3/day, day
// group indices push far days well past the first page.
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
        icsUrl: 'test-ripper-cal1.ics',
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

async function gotoEvents(page) {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()
}

async function routeEvents(page, events) {
  await overrideEventsIndex(page, events)
}

test('the scrubber handle is a date slider on the events list', async ({ page }) => {
  await installDataMocks(page)
  await routeEvents(page, makeEvents())
  await gotoEvents(page)

  await expect(page.getByText('Day 00 Show 0', { exact: true })).toBeVisible()

  // The handle is present and exposes an ARIA slider with a date valuetext.
  const handle = page.getByRole('slider', { name: 'Date scrubber' })
  await expect(handle).toBeVisible()
  await expect(handle).toHaveAttribute('aria-valuetext', /.+/)

  // Hovering reveals the track + date bubble (the resting affordance).
  await handle.hover()
  await expect(page.locator('.a-scrubber-bubble')).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/day-scrubber-idle.png', { fullPage: false })
})

test('dragging the handle jumps the list to a later day', async ({ page }) => {
  await installDataMocks(page)
  await routeEvents(page, makeEvents())

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await gotoEvents(page)
  await expect(page.getByText('Day 00 Show 0', { exact: true })).toBeVisible()
  // A far day is not rendered in the first page.
  await expect(page.getByText('Day 38 Show 0', { exact: true })).toHaveCount(0)

  const handle = page.getByRole('slider', { name: 'Date scrubber' })
  const track = page.locator('.a-scrubber')
  const tb = await track.boundingBox()
  const hb = await handle.boundingBox()

  // Grab the handle and drag part way down. The date bubble appears while
  // dragging, and the list scrolls LIVE — before the finger is lifted.
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height * 0.55, { steps: 12 })
  await expect(page.locator('.a-scrubber-bubble')).toBeVisible()
  // Real-time scroll: the list has already moved while the button is still down.
  await expect
    .poll(async () => page.locator('.a-content').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0)
  await screenshotStable(page, 'e2e/screenshots/day-scrubber-drag.png', { fullPage: false })
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height * 0.9, { steps: 8 })
  await page.mouse.up()

  // Dragging near the end brought a far-future day (not in the first page) into
  // view, and the list is scrolled well down.
  await expect(page.getByText('Day 38 Show 0', { exact: true })).toBeVisible()
  const scrollTop = await page.locator('.a-content').evaluate((el) => el.scrollTop)
  expect(scrollTop, 'list scrolled down after the drag').toBeGreaterThan(0)

  expect(pageErrors, 'no uncaught page errors').toEqual([])
})

test('keyboard moves the scrubber to the end of the timeline', async ({ page }) => {
  await installDataMocks(page)
  await routeEvents(page, makeEvents())
  await gotoEvents(page)
  await expect(page.getByText('Day 00 Show 0', { exact: true })).toBeVisible()

  const handle = page.getByRole('slider', { name: 'Date scrubber' })
  await handle.focus()
  await handle.press('End')

  // End jumps to the last day; its event renders. The handle then re-syncs to
  // the topmost visible day, which sits a few days short of the very last one
  // because the list can't scroll its final day fully to the top — so assert it
  // landed near the end rather than exactly on it.
  await expect(page.getByText('Day 39 Show 0', { exact: true })).toBeVisible()
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThanOrEqual(DAYS - 6)
})

test('no scrubber for a short list', async ({ page }) => {
  await installDataMocks(page)
  // Two days only — below the scrubber threshold, so it stays hidden.
  await routeEvents(page, makeEvents(2))
  await gotoEvents(page)
  await expect(page.getByText('Day 00 Show 0', { exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Date scrubber' })).toHaveCount(0)
})

test('mobile: the handle is a half-off-edge circle without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await installDataMocks(page)
  await routeEvents(page, makeEvents())
  await gotoEvents(page)
  await expect(page.getByText('Day 00 Show 0', { exact: true })).toBeVisible()

  const handle = page.getByRole('slider', { name: 'Date scrubber' })
  await expect(handle).toBeVisible()
  // The circle's right half sits off the screen edge, but must not make the page
  // scroll sideways.
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(noOverflow, 'no horizontal overflow from the edge handle').toBe(true)

  // Grab the visible (left) half so the bubble + blue state show for the shot.
  const hb = await handle.boundingBox()
  await page.mouse.move(hb.x + 4, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 4, hb.y + hb.height / 2 + 40, { steps: 4 })
  await expect(page.locator('.a-scrubber-bubble')).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/day-scrubber-mobile.png', { fullPage: false })
  await page.mouse.up()
})
