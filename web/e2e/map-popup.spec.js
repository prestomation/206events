import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// The venue popup and its drill-down. map.spec.js covers the pin layer and the
// single-series case; this file covers what happens when one pin is a PLACE
// hosting several series.

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

const NEUMOS = { lat: 47.61, lng: -122.32, location: 'Neumos, Capitol Hill' }

// Three distinct series at one address: a weekly run, a two-nighter and a
// one-off. Venue grouping collapses them to a single pin.
const venueEvents = [
  ...[2, 9, 16].map((d) => ({
    icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night',
    date: futureJoda(d), url: `https://example.com/jazz/${d}`, ...NEUMOS,
  })),
  ...[4, 5].map((d) => ({
    icsUrl: 'test-ripper-cal1.ics', summary: 'Punk Weekender',
    date: futureJoda(d), url: `https://example.com/punk/${d}`, ...NEUMOS,
  })),
  {
    icsUrl: 'test-ripper-cal1.ics',
    // Long on purpose: a title wider than the popup must ellipsise, not push
    // the body into a horizontal scroll.
    summary: 'Poetry Slam and Open Mic Night with Featured Readers from Across the Pacific Northwest',
    date: futureJoda(7), url: 'https://example.com/poetry', ...NEUMOS,
  },
]

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  await overrideEventsIndex(page, venueEvents)

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

// The popup is a sibling of the map container (see map.spec.js), and the
// mobile keep-alive can hold a second hidden MapPanel.
const visiblePopup = (page) => page.locator('[data-testid="map-popup"]:visible')

async function openVenue(page) {
  await page.goto('/')
  await expect(page.getByText('Neumos').first()).toBeVisible()
  // `exact` matters: without it this also matches the map bar's "Expand map"
  // button, which silently puts the desktop map full-screen.
  const mapTab = page.getByRole('button', { name: 'Map', exact: true })
  if (await mapTab.count() && await mapTab.first().isVisible()) await mapTab.first().click()
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.events-map')).toBeVisible()
  await expect(map.locator('.mpin')).toHaveCount(1)
  await map.locator('.mpin').click()
  return map
}

test('three series at one address are one pin, and it opens the venue popup', async ({ page }) => {
  const map = await openVenue(page)
  const popup = visiblePopup(page)

  await expect(popup).toBeVisible()
  await expect(popup.locator('.mp-eyebrow')).toHaveText('Venue')
  await expect(popup.getByRole('heading', { name: 'Neumos' })).toBeVisible()
  await expect(popup.locator('.mp-series')).toHaveCount(3)
  await expect(popup.locator('.mp-series').first()).toContainText('Jazz Night')
  // Every series here comes from one feed, so there IS a single unambiguous
  // calendar to follow at the venue level.
  await expect(popup.locator('.mp-follow')).toHaveText('Follow venue')

  await screenshotStable(page, 'e2e/screenshots/map-panel-venue.png', { fullPage: true, expectMarkers: true })
})

test('the pin counts every date at the venue, not just one series', async ({ page }) => {
  await page.goto('/')
  // `exact` matters: without it this also matches the map bar's "Expand map"
  // button, which silently puts the desktop map full-screen.
  const mapTab = page.getByRole('button', { name: 'Map', exact: true })
  if (await mapTab.count() && await mapTab.first().isVisible()) await mapTab.first().click()
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.mpin-count')).toHaveText('6') // 3 + 2 + 1
})

test('picking a series drills in, and the back affordance returns to the venue', async ({ page }) => {
  const map = await openVenue(page)
  const popup = visiblePopup(page)

  await popup.locator('.mp-series', { hasText: 'Punk Weekender' }).click()
  await expect(popup.getByRole('heading', { name: 'Punk Weekender' })).toBeVisible()
  await expect(popup.locator('.mp-daterow')).toHaveCount(2)
  // Its siblings at the same address are offered, and it can go back.
  await expect(popup.getByText('Also at Neumos')).toBeVisible()
  await expect(popup.locator('.mp-series')).toHaveCount(2)

  await screenshotStable(page, 'e2e/screenshots/map-panel-event-from-venue.png', { fullPage: true, expectMarkers: true })

  await popup.getByRole('button', { name: 'Back to Neumos' }).click()
  await expect(popup.getByRole('heading', { name: 'Neumos' })).toBeVisible()
  await expect(popup.locator('.mp-series')).toHaveCount(3)
})

// Regression: Leaflet's panInside reads paddingTopLeft/paddingBottomRight, and
// the previous code passed paddingTopRight/paddingBottomLeft — silently
// ignored, so a clicked pin stayed hidden behind the panel it had just opened.
test('opening a popup pans the clicked pin clear of it', async ({ page }) => {
  // Tested on the expanded map, where the card leaves a real strip of map. In
  // the ~410px docked column the popup covers nearly all of it, so there is
  // nowhere to pan into and the viewport deliberately stays put.
  const map = await openVenue(page)
  await visiblePopup(page).getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Expand map' }).click()
  await map.locator('.mpin').click()

  const popup = visiblePopup(page)
  await expect(popup).toBeVisible()
  await expect.poll(async () => {
    const pin = await map.locator('.mpin-body').boundingBox()
    const card = await popup.boundingBox()
    if (!pin || !card) return false
    // A venue card shells as `panel` (docked right) even on the expanded map,
    // so the pin must end up to the LEFT of it.
    return pin.x + pin.width <= card.x
  }, { message: 'pin should be panned clear of the expanded map card' }).toBe(true)
})

// Regression: Leaflet's zoom control renders above the floating bar (controls
// are z-1000), and the bar used to start under it — clipping "6 EVENTS / Near
// you" to "EVENTS / ear you".
test('the map bar clears Leaflet’s zoom control', async ({ page }) => {
  await page.goto('/')
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.events-map')).toBeVisible()

  const bar = await page.locator('.a-mapbar').boundingBox()
  const zoom = await map.locator('.leaflet-control-zoom').boundingBox()
  expect(bar.x).toBeGreaterThanOrEqual(zoom.x + zoom.width)

  await screenshotStable(page, 'e2e/screenshots/map-chrome-desktop.png', { expectMarkers: true })
})

test('the expanded map gives the popup its two-column wide layout', async ({ page }) => {
  const map = await openVenue(page)
  const popup = visiblePopup(page)
  // Docked in a ~410px column, the popup is one narrow column — and the
  // floating chrome stands down, because there is no room beside it.
  await expect(popup).toHaveClass(/mp-popup--panel/)
  await expect(popup.locator('.mp-split')).toHaveCount(0)
  await expect(page.locator('.a-mapbar')).toBeHidden()

  await popup.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Expand map' }).click()
  await map.locator('.mpin').click()

  // A venue's content is one list, so it stays a single column even here —
  // but full screen there IS room beside it, so the bars retreat rather than
  // hiding, and the map stays usable with the card open.
  const reopened = visiblePopup(page)
  await expect(reopened).toHaveClass(/mp-popup--panel/)
  await expect(reopened.locator('.mp-series')).toHaveCount(3)
  await expect(page.locator('.a-mapbar')).toBeVisible()

  // The EVENT popup does have two columns' worth, so it takes the wide layout.
  await reopened.locator('.mp-series', { hasText: 'Jazz Night' }).click()
  const wide = visiblePopup(page)
  await expect(wide).toHaveClass(/mp-popup--wide/)
  await expect(wide.locator('.mp-split')).toHaveCount(1)
  await expect(wide.locator('.mp-aside .mp-daterow')).toHaveCount(3)
  await expect(wide.locator('.mp-aside .mp-series')).toHaveCount(2) // also here

  await screenshotStable(page, 'e2e/screenshots/map-wide-event.png', { expectMarkers: true })
})

test('Escape steps back one level before it closes', async ({ page }) => {
  const map = await openVenue(page)
  const popup = visiblePopup(page)

  await popup.locator('.mp-series', { hasText: 'Jazz Night' }).click()
  await expect(popup.getByRole('heading', { name: 'Jazz Night' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(popup.getByRole('heading', { name: 'Neumos' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(visiblePopup(page)).toHaveCount(0)
})

test('picking a date selects it rather than navigating away from the map', async ({ page }) => {
  const map = await openVenue(page)
  const popup = visiblePopup(page)
  await popup.locator('.mp-series', { hasText: 'Punk Weekender' }).click()

  // The second date is not selected until it is picked.
  const second = popup.locator('.mp-daterow').nth(1)
  await expect(second).not.toHaveClass(/mp-daterow--on/)
  await second.locator('.mp-daterow-pick').click()
  await expect(second).toHaveClass(/mp-daterow--on/)
  await expect(popup.getByText('Selected')).toBeVisible()
  // Still on the map, popup still open.
  await expect(popup).toBeVisible()
})

test('following from the popup toggles the calendar and reflects it', async ({ page }) => {
  const map = await openVenue(page)
  const popup = visiblePopup(page)
  await popup.locator('.mp-series', { hasText: 'Jazz Night' }).click()

  const pill = popup.locator('.mp-follow')
  await expect(pill).toHaveText('Follow')
  await pill.click()
  await expect(popup.locator('.mp-follow--on')).toHaveText('Following')
})

test('labels appear on the pins once the map is zoomed in far enough', async ({ page }) => {
  await page.goto('/')
  // `exact` matters: without it this also matches the map bar's "Expand map"
  // button, which silently puts the desktop map full-screen.
  const mapTab = page.getByRole('button', { name: 'Map', exact: true })
  if (await mapTab.count() && await mapTab.first().isVisible()) await mapTab.first().click()
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.mpin')).toHaveCount(1)

  // A single pin frames at the fit's maxZoom, which clears the label budget.
  await expect(map.locator('.mpin-label')).toHaveText('Neumos')
  await screenshotStable(page, 'e2e/screenshots/map-pins-labelled.png', { expectMarkers: true })
})

// Regression: the pin used to name itself by splitting the event's `location`
// on its first comma. In this corpus that string is a bare street address for
// 102 of 171 recurring sources, so the headline pill read "5805 Airport Way S"
// while the popup it opened said "Georgetown Trailer Park Mall". Pin and popup
// now share one resolver.
test('a pin names its venue from venues.json when the events only give an address', async ({ page }) => {
  const ADDRESS = { lat: 47.61, lng: -122.32, location: '925 E Pike St, Seattle, WA 98122' }
  await overrideEventsIndex(page, [
    { icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night', date: futureJoda(2), ...ADDRESS },
    { icsUrl: 'test-ripper-cal1.ics', summary: 'Punk Weekender', date: futureJoda(4), ...ADDRESS },
  ])
  await page.goto('/')
  const mapTab = page.getByRole('button', { name: 'Map', exact: true })
  if (await mapTab.count() && await mapTab.first().isVisible()) await mapTab.first().click()
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.mpin')).toHaveCount(1)

  // The pill says the venue, not the street number...
  await expect(map.locator('.mpin-label')).toHaveText('Neumos')
  // ...and the popup it opens agrees with it.
  await map.locator('.mpin').click()
  await expect(visiblePopup(page).getByRole('heading', { name: 'Neumos' })).toBeVisible()
})

// Regression: `discover-slu` declares one ripper-level geo (its office) and
// stamps it on every event it publishes, which happen at 17 different places.
// Grouping on the coordinate alone merged them into one pin named after
// whichever location string was most common, so the South Lake Union Farmers
// Market showed up at "The Behnke Family Gallery".
test('events sharing a stamped coordinate stay separate when they name different places', async ({ page }) => {
  const AT = { lat: 47.61, lng: -122.32 }
  await overrideEventsIndex(page, [
    { icsUrl: 'test-ripper-cal1.ics', summary: 'Farmers Market', date: futureJoda(2), ...AT, location: 'The Spheres, South Lake Union, Seattle, WA' },
    { icsUrl: 'test-ripper-cal1.ics', summary: 'Gallery Walk', date: futureJoda(3), ...AT, location: 'The Behnke Family Gallery, South Lake Union, Seattle, WA' },
  ])
  await page.goto('/')
  const mapTab = page.getByRole('button', { name: 'Map', exact: true })
  if (await mapTab.count() && await mapTab.first().isVisible()) await mapTab.first().click()
  const map = page.locator('.events-map-container:visible').first()
  // Two places, so two pins — which at one coordinate means a cluster of 2,
  // never a single pin claiming both events.
  await expect(map.locator('.mpin, .cluster-icon')).toHaveCount(1)
  await expect(map.locator('.cluster-icon')).toHaveText('2')
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test.skip(({ browserName }) => browserName === 'firefox', 'isMobile not supported in Firefox')

  // Regression: `.mp-serieslist` is a grid, and a grid item's automatic minimum
  // size is its CONTENT — so a long event name refused to shrink and scrolled
  // the popup body sideways instead of ellipsising inside it.
  test('a long event name ellipsises rather than scrolling the sheet sideways', async ({ page }) => {
    await openVenue(page)
    const popup = visiblePopup(page)
    const body = popup.locator('.mp-body')
    await expect(body).toBeVisible()

    const overflow = await body.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(overflow.scrollWidth, 'popup body must not scroll horizontally')
      .toBeLessThanOrEqual(overflow.clientWidth)

    // And the long title is actually clipped, not just wrapped off-screen.
    const clipped = await popup.locator('.mp-series-title').last()
      .evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(clipped, 'the long title should be ellipsised').toBe(true)
  })

  test('the venue popup opens as a bottom sheet listing every series', async ({ page }) => {
    const map = await openVenue(page)
    const popup = visiblePopup(page)
    await expect(popup.locator('.mp-handle')).toBeVisible()
    await expect(popup.locator('.mp-series')).toHaveCount(3)
    await expect(popup.getByText('3 series here')).toBeVisible()

    await screenshotStable(page, 'e2e/screenshots/map-sheet-venue-mobile.png', { expectMarkers: true })
  })
})
