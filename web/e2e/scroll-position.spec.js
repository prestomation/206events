import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { mockManifest } from './fixtures.js'
import { screenshotStable } from './screenshot.js'

// Scroll restoration across back-navigation.
//
// Repro of the reported bug: browse down the Discover → Events list, open an
// event to read it, then go back to keep browsing. The list should return to
// where you left off.
//
// The `.a-content` scroll container is keyed by view (App206.jsx), so React
// remounts it on back-nav; a per-view scroll map restores the offset. That
// restore only survived when the reader never left the FIRST PAGE of the list:
//
//   1. `PagedDayList` keeps its page window in component-local state, so the
//      remount renders one page (60 rows) again. Assigning the saved offset to
//      a container that short is silently CLAMPED by the browser.
//   2. The scroll listener is attached right after the assignment, so the
//      clamped value is written straight back over the saved one — the real
//      position is destroyed by the first failed restore.
//   3. Channel/venue pages parse their ICS after mount, so their height isn't
//      there yet when a one-shot mount-time restore runs.
//   4. All events shared one scroll key and all channels another, so one
//      detail view's offset was restored onto a different one.
//
// The first test below covers the narrow single-page case that already worked.
// The rest cover 1-4 and were RED before the fix.

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

// A list several pages deep (EVENTS_PAGE_SIZE is 60), spaced 2h apart so it
// spans many day groups. Titles are `#`-prefixed and zero-padded so
// "Event #149" can never substring-match another row.
const DEEP_TOTAL = 200
function makeDeepEvents(icsUrl = 'test-ripper-cal1.ics', prefix = 'Event', total = DEEP_TOTAL) {
  // Whole minutes: the index timestamps carry no seconds (toJoda pins ":00"),
  // and the parsed-vs-index join below matches on the exact start instant.
  const base = new Date()
  base.setSeconds(0, 0)
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(base.getTime() + (i + 1) * 2 * 3600 * 1000)
    return {
      icsUrl,
      summary: `${prefix} #${String(i).padStart(3, '0')}`,
      description: `Number ${i}`,
      location: 'Neumos, Capitol Hill',
      date: toJoda(d),
      lat: 47.61,
      lng: -122.32,
      // Keep the parsed-vs-index join key (summary + start instant) resolvable.
      _startMs: d.getTime(),
    }
  })
}

// Render the same events as an ICS body so a channel/venue page has a long,
// asynchronously-parsed list. `ParsedEventRow` only becomes clickable when the
// row joins an events-index entry on `summary` + start instant, so both sides
// are generated from one source list.
function icsFor(events) {
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const body = events.map((e, i) => [
    'BEGIN:VEVENT',
    `UID:deep-${i}@test`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(e._startMs)}`,
    `DTEND:${stamp(e._startMs + 3600 * 1000)}`,
    `SUMMARY:${e.summary}`,
    `LOCATION:${e.location}`,
    'END:VEVENT',
  ].join('\r\n')).join('\r\n')
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}\r\nEND:VCALENDAR`
}

// How far apart a restored offset may land from the saved one. Bounded on both
// sides so a regression that lands at the bottom can't masquerade as a pass.
const TOLERANCE = 50

async function expectRestored(content, saved, timeout = 5000) {
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop), {
      message: 'scroll position should be restored after back-navigation',
      timeout,
    })
    .toBeGreaterThanOrEqual(saved - TOLERANCE)

  const restored = await content.evaluate((el) => el.scrollTop)
  expect(restored, 'scroll position should not overshoot the saved place')
    .toBeLessThanOrEqual(saved + TOLERANCE)
}

// Page the list until `title` has rendered, then centre it in the viewport.
// Returns the resulting scrollTop.
async function pageDownTo(page, content, title, timeout = 20000) {
  await expect(async () => {
    await content.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(page.getByText(title, { exact: true })).toHaveCount(1)
  }).toPass({ timeout })

  await page.getByText(title, { exact: true })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }))
  return content.evaluate((el) => el.scrollTop)
}

// Per-page uncaught-error buckets, keyed off the Playwright page so we don't
// monkey-patch custom properties onto it (which risks colliding with internal
// Playwright fields).
const pageErrorsByPage = new WeakMap()

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)

  const pageErrors = []
  pageErrorsByPage.set(page, pageErrors)
  page.on('pageerror', (err) => pageErrors.push(err))
})

test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page) ?? [], 'no uncaught page errors').toEqual([])
})

async function gotoEvents(page) {
  await page.goto('/')
  // Wait past the boot splash.
  await expect(page.getByText('Neumos').first()).toBeVisible()
  // Switch Discover into Events mode so the day-grouped event list renders.
  await page.getByText('Events', { exact: true }).first().click()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()
}

test('event list keeps its scroll position after opening details and going back', async ({ page }) => {
  // Sanity: the manifest still describes cal1, so the fixtures stay coherent.
  expect(mockManifest.rippers[0].calendars[0].icsUrl).toBe('test-ripper-cal1.ics')

  // A single page's worth of events — the case that already worked.
  await overrideEventsIndex(page, makeManyEvents(60))
  await gotoEvents(page)

  const content = page.locator('.a-content')

  // Browse down: center a row that lives well below the fold. This scrolls the
  // content container (not the window) and leaves the target row in view so the
  // subsequent click won't auto-scroll and perturb the saved position.
  const target = page.locator('.a-content .ev').nth(30)
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))

  const savedScroll = await content.evaluate((el) => el.scrollTop)
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

  await expectRestored(content, savedScroll)
})

test('a list paged past the first window keeps its place after opening details and going back', async ({ page }) => {
  await overrideEventsIndex(page, makeDeepEvents())
  await gotoEvents(page)

  const content = page.locator('.a-content')
  // #150 lives well past the 60-row first page, so getting there requires the
  // infinite-scroll pager to have grown the window at least twice.
  const savedScroll = await pageDownTo(page, content, 'Event #150')
  expect(savedScroll, 'should be many screens down').toBeGreaterThan(2000)
  await screenshotStable(page, 'e2e/screenshots/scroll-restore-deep-list.png', { fullPage: false })

  await page.getByText('Event #150', { exact: true }).click()
  const backBtn = page.locator('.a-content .a-iconbtn').first()
  await expect(backBtn).toBeVisible()

  await backBtn.click()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  await expectRestored(content, savedScroll)
  // The row we opened is back on screen, not just some arbitrary offset.
  await expect(page.getByText('Event #150', { exact: true })).toBeInViewport()
  await screenshotStable(page, 'e2e/screenshots/scroll-restore-after-back.png', { fullPage: false })
})

test('the browser Back button restores the list scroll position too', async ({ page }) => {
  await overrideEventsIndex(page, makeDeepEvents())
  await gotoEvents(page)

  const content = page.locator('.a-content')
  const savedScroll = await pageDownTo(page, content, 'Event #120')
  expect(savedScroll, 'should be many screens down').toBeGreaterThan(2000)

  await page.getByText('Event #120', { exact: true }).click()
  await expect(page.locator('.a-content .a-iconbtn').first()).toBeVisible()
  // The detail's history entry is written from an effect inside a transition,
  // so wait for it to land — Back before that pops the wrong entry.
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('event=')

  // Browser history back — hash routing feeds popstate, which reapplies the
  // list view. Same destination as the in-app arrow, different entry point.
  await page.goBack()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  await expectRestored(content, savedScroll)
})

// Both routes back to a venue are covered: the in-app arrow here, browser Back
// in the case below it. They land on the same state, but by different paths —
// the arrow re-opens the recorded venue, Back pops the hash to it.
test('a venue page keeps its place after opening an event and going back', async ({ page }) => {
  const events = makeDeepEvents()
  await overrideEventsIndex(page, events)
  // The channel page parses this ICS *after* mount, so its height lands late.
  await page.route('**/test-ripper-cal1.ics', (route) =>
    route.fulfill({ status: 200, contentType: 'text/calendar', body: icsFor(events) }))

  await page.goto('/')
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()
  // The parsed list has landed.
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  const content = page.locator('.a-content')
  const target = page.locator('.a-content .ev').nth(40)
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const savedScroll = await content.evaluate((el) => el.scrollTop)
  expect(savedScroll, 'venue page should be scrolled away from the top').toBeGreaterThan(500)

  // The row joins its events-index entry, so it navigates to the event detail.
  await target.click()
  await expect.poll(() => page.evaluate(() => window.location.hash))
    .toContain('event=')

  // Back to the venue page — its list is re-parsed from the ICS, so the height
  // this offset needs only exists a beat after the container mounts.
  await page.locator('.a-content .a-iconbtn').first().click()
  await expect(page.getByText(`${DEEP_TOTAL} UPCOMING EVENTS`)).toBeVisible()

  await expectRestored(content, savedScroll)
})

test('a venue page keeps its place when returning via browser Back too', async ({ page }) => {
  const events = makeDeepEvents()
  await overrideEventsIndex(page, events)
  await page.route('**/test-ripper-cal1.ics', (route) =>
    route.fulfill({ status: 200, contentType: 'text/calendar', body: icsFor(events) }))

  await page.goto('/')
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  const content = page.locator('.a-content')
  const target = page.locator('.a-content .ev').nth(40)
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const savedScroll = await content.evaluate((el) => el.scrollTop)
  expect(savedScroll).toBeGreaterThan(500)

  await target.click()
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('event=')

  await page.goBack()
  await expect(page.getByText(`${DEEP_TOTAL} UPCOMING EVENTS`)).toBeVisible()

  await expectRestored(content, savedScroll)
})

test('editing the search while reading an event drops the saved position', async ({ page }) => {
  await overrideEventsIndex(page, makeDeepEvents())
  await gotoEvents(page)

  const content = page.locator('.a-content')
  const savedScroll = await pageDownTo(page, content, 'Event #150')
  expect(savedScroll).toBeGreaterThan(2000)

  await page.getByText('Event #150', { exact: true }).click()
  await expect(page.locator('.a-content .a-iconbtn').first()).toBeVisible()

  // The search box stays usable on a detail page, so the reader can change the
  // result set while the list is unmounted. Coming back to a DIFFERENT list
  // deep inside it would be worse than not restoring at all.
  await page.getByPlaceholder('Search events & venues…').fill('Event #18')
  await page.locator('.a-content .a-iconbtn').first().click()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  await expect
    .poll(() => content.evaluate((el) => el.scrollTop), {
      message: 'a re-filtered list should start at the top',
      timeout: 5000,
    })
    .toBeLessThanOrEqual(TOLERANCE)
})

test('Discover’s Calendars and Events modes keep separate scroll positions', async ({ page }) => {
  await overrideEventsIndex(page, makeDeepEvents())
  await gotoEvents(page)

  const content = page.locator('.a-content')
  const savedScroll = await pageDownTo(page, content, 'Event #150')
  expect(savedScroll).toBeGreaterThan(2000)

  // The two modes share the container but not their length — the Calendars grid
  // is a couple of rows. Switching clamps the container, and without a separate
  // key that clamped value overwrites the events list's real position.
  await page.getByText('Calendars', { exact: true }).first().click()
  await expect(page.locator('.a-content .ch').first()).toBeVisible()

  await page.getByText('Events', { exact: true }).first().click()
  await expect(page.locator('.a-content .ev').first()).toBeVisible()

  await expectRestored(content, savedScroll)
})

test('narrowing the search while deep in the list lands at the top, not the bottom', async ({ page }) => {
  await overrideEventsIndex(page, makeDeepEvents())
  await gotoEvents(page)

  const content = page.locator('.a-content')
  expect(await pageDownTo(page, content, 'Event #150')).toBeGreaterThan(2000)

  // Filtering in place leaves the container sitting at an offset the new,
  // shorter result set can't hold. Forgetting the saved offset isn't enough —
  // the browser just clamps, which parks the reader at the BOTTOM of a list
  // they never scrolled.
  await page.getByPlaceholder('Search events & venues…').fill('Event #18')
  await expect(page.getByText('Event #150', { exact: true })).toHaveCount(0)

  await expect
    .poll(() => content.evaluate((el) => el.scrollTop), {
      message: 'a narrowed list should start at the top',
      timeout: 5000,
    })
    .toBeLessThanOrEqual(TOLERANCE)
})

test('opening a second event from a detail page starts that page at the top', async ({ page }) => {
  // Four occurrences of one title so the detail page carries an "Other dates"
  // list, which navigates event → event WITHOUT remounting `.a-content` (its
  // React key stays 'ev'). The scroll offset has to be reset explicitly there.
  const base = new Date()
  base.setSeconds(0, 0)
  const series = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(base.getTime() + (i + 1) * 24 * 3600 * 1000)
    return {
      icsUrl: 'test-ripper-cal1.ics',
      summary: 'Weekly Trivia Night',
      // Long enough that the detail page itself overflows and can be scrolled.
      description: `Pub trivia. ${'Teams of up to six, prizes for the top three. '.repeat(60)}`,
      location: 'Neumos, Capitol Hill',
      date: toJoda(d),
      lat: 47.61,
      lng: -122.32,
    }
  })
  await overrideEventsIndex(page, [...series, ...makeDeepEvents()])
  await gotoEvents(page)

  const content = page.locator('.a-content')
  await page.locator('.a-content .ev').first().click()
  const otherDates = page.locator('.a-content .ev')
  await expect(otherDates.first()).toBeVisible()

  // Scroll the detail page down, then jump to a sibling occurrence. The
  // description arrives from the lazy dictionary a beat after the page opens,
  // so retry until the page is actually tall enough to scroll.
  await expect(async () => {
    await content.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect(await content.evaluate((el) => el.scrollTop), 'detail page should be scrollable')
      .toBeGreaterThan(TOLERANCE)
  }).toPass({ timeout: 10000 })

  await otherDates.last().click()

  await expect
    .poll(() => content.evaluate((el) => el.scrollTop), {
      message: 'a newly opened event should start at the top',
      timeout: 5000,
    })
    .toBeLessThanOrEqual(TOLERANCE)
})

test('a different venue page starts at the top rather than inheriting the last one’s offset', async ({ page }) => {
  const cal1 = makeDeepEvents('test-ripper-cal1.ics', 'Neumos Show')
  const cal2 = makeDeepEvents('test-ripper-cal2.ics', 'SIFF Show')
  await overrideEventsIndex(page, [...cal1, ...cal2])
  await page.route('**/test-ripper-cal1.ics', (route) =>
    route.fulfill({ status: 200, contentType: 'text/calendar', body: icsFor(cal1) }))
  await page.route('**/test-ripper-cal2.ics', (route) =>
    route.fulfill({ status: 200, contentType: 'text/calendar', body: icsFor(cal2) }))

  await page.goto('/')
  const content = page.locator('.a-content')

  // Scroll deep into the first venue, then leave it.
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()
  await expect(page.getByText('Neumos Show #000', { exact: true })).toBeVisible()
  await page.locator('.a-content .ev').nth(40).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(500)
  await page.locator('.a-content .a-iconbtn').first().click()

  // A different venue is a different view — it must start at the top.
  await page.locator('.ch', { hasText: 'SIFF' }).first().click()
  await expect(page.getByText('SIFF Show #000', { exact: true })).toBeVisible()
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop), {
      message: 'a freshly opened venue page should start at the top',
      timeout: 3000,
    })
    .toBeLessThanOrEqual(TOLERANCE)
})
