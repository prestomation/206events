import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// The health page's coverage chart: three small-multiple panels sharing an
// x-axis, a crosshair driven by pointer or keyboard, and a readout of the
// selected date. mockEventHistory (fixtures.js) is built so the last point has
// unmistakable values — events 12,345 / calendars 678 / candidates 90 /
// queue 111 / errors 7 — and `candidates` is present only on the final third,
// which is the partial-series case these tests mostly guard.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

const openChart = async (page) => {
  await page.goto('/#section=health')
  const plot = page.getByRole('slider', { name: /coverage history date/i })
  await expect(plot).toBeVisible()
  return plot
}

const readout = (page) => page.locator('.health-chart-readout')
const metric = (page, key) => page.locator(`.health-chart-readout-row[data-metric="${key}"]`)

test('renders one panel per series, candidates included', async ({ page }) => {
  const plot = await openChart(page)
  for (const key of ['events', 'calendars', 'candidates']) {
    await expect(plot.locator(`[data-panel="${key}"]`)).toBeVisible()
  }
  await expect(plot.locator('[data-panel="candidates"] polyline')).not.toHaveCount(0)
  await expect(plot).toContainText('Viable candidates')
})

test('shows the latest point before any interaction, with no crosshair', async ({ page }) => {
  const plot = await openChart(page)
  await expect(readout(page)).toContainText('12,345')
  await expect(readout(page)).toContainText('678')
  await expect(plot.locator('.health-chart-crosshair')).toHaveCount(0)
  await screenshotStable(page, 'e2e/screenshots/coverage-chart-desktop.png')
})

test('clicking scrubs to another date and draws the crosshair', async ({ page }) => {
  const plot = await openChart(page)
  const before = await readout(page).locator('.health-chart-readout-date').textContent()

  const box = await plot.boundingBox()
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)

  await expect(plot.locator('.health-chart-crosshair')).toBeVisible()
  await expect(readout(page).locator('.health-chart-readout-date')).not.toHaveText(before)
  await screenshotStable(page, 'e2e/screenshots/coverage-chart-desktop-selected.png')
})

// The guard against a series that starts late being drawn as a line down to
// zero: at an early date candidates must read "not recorded", not 0.
test('reports a not-yet-tracked series as an em-dash, not zero', async ({ page }) => {
  const plot = await openChart(page)
  await plot.focus()

  await page.keyboard.press('Home')
  await expect(metric(page, 'candidates')).toContainText('—')
  await expect(metric(page, 'candidates')).not.toContainText('0')

  await page.keyboard.press('End')
  await expect(metric(page, 'candidates')).toContainText('90')

  // One note per late-starting metric, readout-only ones included: an
  // unexplained blank reads as a zero in the readout just as on a panel.
  await expect(page.locator('.health-chart-note', { hasText: 'Viable candidates tracked from' }))
    .toBeVisible()
  await expect(page.locator('.health-chart-note', { hasText: 'Open work queue tracked from' }))
    .toBeVisible()
})

test('scrubs with the keyboard and reports position through aria', async ({ page }) => {
  const plot = await openChart(page)
  await plot.focus()

  await page.keyboard.press('Home')
  await expect(plot).toHaveAttribute('aria-valuenow', '0')
  const first = await plot.getAttribute('aria-valuetext')

  await page.keyboard.press('ArrowRight')
  await expect(plot).toHaveAttribute('aria-valuenow', '1')
  await expect(plot).not.toHaveAttribute('aria-valuetext', first)

  await page.keyboard.press('End')
  await expect(readout(page)).toContainText('12,345')
})

// The queued animation frame still holds the last pointer position, so leaving
// without cancelling it re-selects a frame later and the crosshair stays drawn
// with the pointer nowhere near the chart.
test('clears the crosshair when the pointer leaves', async ({ page }) => {
  const plot = await openChart(page)
  const box = await plot.boundingBox()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await expect(plot.locator('.health-chart-crosshair')).toBeVisible()

  // Straight out past the right edge, in one fast movement.
  await page.mouse.move(box.x + box.width + 200, box.y + box.height / 2)
  await expect(plot.locator('.health-chart-crosshair')).toHaveCount(0)
})

// The chart is aria-hidden decoration; the numbers must still be reachable as
// text. This is what makes the migration off role="img" real.
test('exposes every point in a screen-reader table', async ({ page }) => {
  await openChart(page)
  const table = page.getByRole('table', { name: /coverage history/i })
  await expect(table.getByRole('cell', { name: '12,345', exact: true })).toBeAttached()
  await expect(table.getByRole('cell', { name: 'Not recorded' }).first()).toBeAttached()
  await expect(page.locator('.health-chart-plot > svg')).toHaveAttribute('aria-hidden', 'true')
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  // isMobile is a Chromium-only emulation feature; Firefox rejects it outright.
  test.skip(({ browserName }) => browserName === 'firefox', 'isMobile not supported in Firefox')

  test('runs edge to edge without making the page scroll sideways', async ({ page }) => {
    await openChart(page)
    const box = await page.locator('.health-coverage-chart').boundingBox()
    expect(box.x).toBeLessThanOrEqual(1)
    expect(box.width).toBeGreaterThanOrEqual(389)

    // Guards against anyone "fixing" full-bleed with negative margins, which
    // .health-dashboard's overflow-y would clip on the left.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
    expect(overflows).toBe(false)
    await screenshotStable(page, 'e2e/screenshots/coverage-chart-mobile.png')
  })

  test('tapping selects a date and keeps it after the finger lifts', async ({ page }) => {
    const plot = await openChart(page)
    const box = await plot.boundingBox()
    await page.locator('.health-chart-hit').tap({
      position: { x: box.width * 0.3, y: box.height / 2 },
    })
    await expect(plot.locator('.health-chart-crosshair')).toBeVisible()
    await expect(readout(page)).toBeVisible()
    await screenshotStable(page, 'e2e/screenshots/coverage-chart-mobile-selected.png')
  })

  // Only the CHART is edge-to-edge. The gutter moved onto the dashboard's
  // children, so a child with a border (.health-tabs has a border-bottom) must
  // still be inset — which is why that rule uses margin, not padding.
  test('keeps bordered siblings inset while the chart is full width', async ({ page }) => {
    await openChart(page)
    const tabs = await page.locator('.health-tabs').boundingBox()
    expect(tabs.x).toBeGreaterThanOrEqual(8)
    expect(tabs.width).toBeLessThanOrEqual(390 - 16)
  })

  // A cheap proxy for "the chart does not trap vertical page scroll".
  test('lets a vertical drag scroll the page', async ({ page }) => {
    await openChart(page)
    await expect(page.locator('.health-chart-plot')).toHaveCSS('touch-action', 'pan-y')
  })
})
