import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Map-view smoke tests. These exercise the real built bundle: temporal-group
// markers, the drill-down panel, and (critically) that clicking a pin never
// throws an uncaught page error.

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
  // Override the events index with geocoded, map-friendly fixtures (this route
  // is registered after installDataMocks', so it takes precedence).
  await page.route('**/events-index.json', (route) => route.fulfill(json(mapEvents)))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

// Boot the app, reveal the map, and return the *visible* map container. On
// mobile the desktop column map is also in the DOM (display:none), so every
// query is scoped to the visible container to avoid strict-mode ambiguity.
async function openMap(page) {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()
  const mapTab = page.getByRole('button', { name: 'Map' })
  if (await mapTab.count() && await mapTab.first().isVisible()) await mapTab.first().click()
  const map = page.locator('.events-map-container:visible').first()
  await expect(map.locator('.events-map')).toBeVisible()
  return map
}

test('renders group and plain markers on the map', async ({ page }) => {
  const map = await openMap(page)
  // The three-night run collapses to one badged group marker; the one-off is a
  // plain Leaflet marker.
  await expect(map.locator('.event-group-marker')).toHaveCount(1)
  await expect(map.locator('.event-group-badge')).toHaveText('3')
  await expect(map.locator('img.leaflet-marker-icon')).toHaveCount(1)
})

test('clicking a group pin opens the panel listing every date', async ({ page }) => {
  const map = await openMap(page)
  await map.locator('.event-group-marker').click()

  const panel = map.getByTestId('event-group-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Long Run Musical')).toBeVisible()
  await expect(panel.getByText('3 dates')).toBeVisible()
  // Each date links to its instance.
  await expect(panel.locator('a.egp-row')).toHaveCount(3)
})

test('clicking a single-event pin opens the panel', async ({ page }) => {
  const map = await openMap(page)
  await map.locator('img.leaflet-marker-icon').click()

  const panel = map.getByTestId('event-group-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('One Night Only')).toBeVisible()
  await expect(panel.getByText('Event')).toBeVisible()
})

test('the panel closes via its close button', async ({ page }) => {
  const map = await openMap(page)
  await map.locator('.event-group-marker').click()
  const panel = map.getByTestId('event-group-panel')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toHaveCount(0)
})

// Mobile (Android-like) viewport: the map is a tab and the panel is a bottom
// sheet with the preview mode toggle. Clicking a pin must not crash.
test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('clicking a pin opens the draggable bottom sheet without errors', async ({ page }) => {
    const map = await openMap(page)
    await map.locator('.event-group-marker').click()
    const panel = map.getByTestId('event-group-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('Long Run Musical')).toBeVisible()
    // The sheet opens at the peek height (dvh) with a drag handle.
    await expect(panel.locator('.egp-handle')).toBeVisible()
    await expect(panel).toHaveAttribute('style', /height:\s*45dvh/)
  })

  test('dragging the handle resizes the sheet and keeps it on screen', async ({ page }) => {
    const map = await openMap(page)
    await map.locator('.event-group-marker').click()
    const panel = map.getByTestId('event-group-panel')
    await expect(panel).toBeVisible()

    const handle = panel.locator('.egp-handle')
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
