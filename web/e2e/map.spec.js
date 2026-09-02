import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// Map-view smoke tests. These exercise the real built bundle: venue pins, the
// popup they open, and (critically) that clicking a pin never throws an
// uncaught page error.
//
// A pin is a VENUE, not a series (lib/event-grouping.js groupByVenue), so the
// two fixtures below — a three-night run at Neumos and a one-off in Bellevue —
// are two pins, and the Neumos pin carries a "3" date count.

// A js-joda-style local datetime string N days out at the given hour.
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

const NEUMOS = { lat: 47.61, lng: -122.32 }
const BELLEVUE = { lat: 47.6101, lng: -122.2015 } // ~9km east, won't spatially cluster with Neumos

// One conceptual event running three nights at Neumos (-> a single badged group
// marker) plus a one-off in Bellevue (-> a plain marker), both geocoded.
const mapEvents = [
  ...[2, 3, 4].map((d) => ({
    icsUrl: 'test-ripper-cal1.ics', summary: 'Long Run Musical', location: 'Neumos, Capitol Hill',
    date: futureJoda(d), url: `https://example.com/run/${d}`, ...NEUMOS,
  })),
  {
    icsUrl: 'test-ripper-cal1.ics', summary: 'One Night Only', location: 'Bellevue',
    date: futureJoda(5), url: 'https://example.com/one', ...BELLEVUE,
  },
]

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Override the events corpus with geocoded, map-friendly fixtures (these
  // routes are registered after installDataMocks', so they take precedence).
  await overrideEventsIndex(page, mapEvents)

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

// Boot the app, reveal the map, and return the *visible* map container. The
// desktop map column only mounts at the desktop breakpoint (see
// map-mount.spec.js), but queries stay scoped to the visible container so the
// helper is robust at any viewport.
async function openMap(page) {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()
  // `exact` matters: without it this also matches the map bar's "Expand map"
  // button, which silently puts the desktop map full-screen.
  const mapTab = page.getByRole('button', { name: 'Map', exact: true })
  if (await mapTab.count() && await mapTab.first().isVisible()) await mapTab.first().click()
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.events-map')).toBeVisible()
  return map
}

// The two pins, told apart by their date count: only the three-night run has
// one. Both are divIcons now — there is no <img> marker left to key off.
const runPin = (map) => map.locator('.mpin:has(.mpin-count)')
const singlePin = (map) => map.locator('.mpin:not(:has(.mpin-count))')

// The popup is a sibling of the map container (it lives in MapPanel, so that
// following a calendar re-renders it without rebuilding the marker layer), and
// the mobile keep-alive can hold a second, hidden MapPanel — so scope to the
// visible one at page level rather than inside .events-map-container.
const visiblePopup = (page) => page.locator('[data-testid="map-popup"]:visible')

// Issue #653: the map frames its initial viewport at the metro extent
// (city.config clampBounds) the moment it mounts, so OSM tiles for the right
// zoom load immediately — instead of the map opening at the city-center default
// zoom (12) and then animating out to frame events once they arrive. OSM tile
// urls embed the zoom as `/{z}/{x}/{y}.png`; we capture every tile request and
// assert the map requested wide metro-extent tiles (zoom <= 11) at mount. The
// old city-center start never requested those: it began at zoom 12 and FitBounds
// only ever zooms *in* to frame the (clustered, nearby) test markers.
test('requests metro-extent tiles at mount (no city-center zoom-in animation)', async ({ page }) => {
  // Record the zoom of every OSM tile request, in order. The *first* request
  // reveals the map's mount viewport before FitBounds adjusts to the events.
  const tileZooms = []
  page.on('request', (req) => {
    const m = req.url().match(/tile\.openstreetmap\.org\/(\d+)\/\d+\/\d+\.png/)
    if (m) tileZooms.push(parseInt(m[1], 10))
  })

  const map = await openMap(page)
  // Markers still render (the events fit happens on top of the initial frame).
  await expect(map.locator('.mpin')).toHaveCount(2)

  // Wait for the first tile request to land, then assert the map mounted framed
  // at the wide metro extent (zoom <= 11) rather than the old city-center zoom
  // (12). On the old code this first request was zoom 12 — extra tiles that were
  // then thrown away when FitBounds animated the zoom to frame the events.
  await expect.poll(() => tileZooms.length, {
    message: 'expected at least one OSM tile request',
    timeout: 5000,
  }).toBeGreaterThan(0)
  expect(tileZooms[0], 'first tile request should be a metro-extent zoom (<= 11)')
    .toBeLessThanOrEqual(11)

  await screenshotStable(page, 'e2e/screenshots/map-initial-bounds.png', { expectMarkers: true })
})

test('renders one pin per venue, with a date count on the multi-date one', async ({ page }) => {
  const map = await openMap(page)
  // Two venues, so two pins. The three-night run's pin carries its date count;
  // the one-off shows no lonely "1".
  await expect(map.locator('.mpin')).toHaveCount(2)
  await expect(map.locator('.mpin-count')).toHaveCount(1)
  await expect(map.locator('.mpin-count')).toHaveText('3')
})

test('clicking a multi-date pin opens the popup listing every date', async ({ page }) => {
  const map = await openMap(page)
  await runPin(map).click()

  const popup = visiblePopup(page)
  await expect(popup).toBeVisible()
  await expect(popup.getByText('Long Run Musical')).toBeVisible()
  await expect(popup.getByText('3 dates').first()).toBeVisible()
  // One row per date, each with a link out to that instance's own page.
  await expect(popup.locator('.mp-daterow')).toHaveCount(3)
  await expect(popup.locator('a.mp-daterow-go')).toHaveCount(3)

  await screenshotStable(page, 'e2e/screenshots/map-panel-event.png', { fullPage: true, expectMarkers: true })
})

test('clicking a single-event pin opens its popup directly', async ({ page }) => {
  const map = await openMap(page)
  await singlePin(map).click()

  const popup = visiblePopup(page)
  await expect(popup).toBeVisible()
  await expect(popup.getByText('One Night Only')).toBeVisible()
  await expect(popup.getByText('Event')).toBeVisible()
  // One series at this venue, so there is no venue level to go back to.
  await expect(popup.locator('.mp-back')).toHaveCount(0)
})

test('the popup closes via its close button and on Escape', async ({ page }) => {
  const map = await openMap(page)
  await runPin(map).click()
  const popup = visiblePopup(page)
  await expect(popup).toBeVisible()
  await popup.getByRole('button', { name: 'Close' }).click()
  await expect(popup).toHaveCount(0)

  await runPin(map).click()
  await expect(visiblePopup(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(visiblePopup(page)).toHaveCount(0)
})

test('the open pin reads as selected, and is labelled even when the budget is off', async ({ page }) => {
  const map = await openMap(page)
  // Two pins ~9km apart frame at a zoom below the label threshold, so neither
  // wears its name until one is opened.
  await expect(map.locator('.mpin-label')).toHaveCount(0)
  await runPin(map).click()
  await expect(map.locator('.mpin--sel')).toHaveCount(1)
  await expect(map.locator('.mpin--sel .mpin-label')).toHaveText('Long Run Musical')

  await screenshotStable(page, 'e2e/screenshots/map-pin-selected.png', { expectMarkers: true })
})

// Mobile (Android-like) viewport: the map is a tab and the popup is a bottom
// sheet. Clicking a pin must not crash.
test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  // isMobile is a Chromium-only emulation feature; Firefox rejects it outright.
  test.skip(({ browserName }) => browserName === 'firefox', 'isMobile not supported in Firefox')

  test('clicking a pin opens the draggable bottom sheet without errors', async ({ page }) => {
    const map = await openMap(page)
    await runPin(map).click()
    const panel = visiblePopup(page)
    await expect(panel).toBeVisible()
    await expect(panel.getByText('Long Run Musical')).toBeVisible()
    // The sheet opens at the peek height (dvh) with a drag handle.
    await expect(panel.locator('.mp-handle')).toBeVisible()
    await expect(panel).toHaveAttribute('style', /height:\s*45dvh/)
    // The narrow layout scans dates as a chip strip rather than rows.
    await expect(panel.locator('.mp-chip')).toHaveCount(3)

    await screenshotStable(page, 'e2e/screenshots/map-sheet-event-mobile.png', { expectMarkers: true })
  })

  test('dragging the handle resizes the sheet and keeps it on screen', async ({ page }) => {
    const map = await openMap(page)
    await runPin(map).click()
    const panel = visiblePopup(page)
    await expect(panel).toBeVisible()

    const handle = panel.locator('.mp-handle')
    const box = await handle.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Drag the handle far up; the sheet grows but the handle stays on screen.
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, 5, { steps: 12 })
    await page.mouse.up()
    const grown = await panel.evaluate((el) => el.getBoundingClientRect())
    const vh = page.viewportSize().height
    expect(grown.top).toBeGreaterThanOrEqual(0) // never slid off the top
    expect(grown.height).toBeLessThanOrEqual(vh * 0.92)
    // Handle is still within the viewport so it can be pulled back down.
    const hb = await handle.boundingBox()
    expect(hb.y).toBeGreaterThanOrEqual(0)
    expect(hb.y).toBeLessThan(vh)
  })
})
