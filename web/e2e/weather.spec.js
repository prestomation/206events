import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { mockWeatherEvents } from './fixtures.js'
import { screenshotStable } from './screenshot.js'

// Verifies the weather badge for outdoor events (docs/weather-badges.md):
// compact glyph on list rows, full chip on the event detail hero, popup with
// confidence/as-of/attribution receipts, low-confidence tempering ("rain
// possible" instead of a percentage), and the client-side staleness guard
// (a forecast older than the hide threshold renders no badge at all). Also
// captures committed screenshots (per AGENTS.md "UI Changes" rule).

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Override the events corpus with the weather fixtures (kept out of the
  // shared mockEvents so other specs' counts are unaffected). Later route wins.
  await overrideEventsIndex(page, mockWeatherEvents)

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('list rows show a compact weather glyph; stale forecasts show none', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  // Sunny high-confidence event carries the compact badge on its row.
  const sunnyRow = page.locator('.ev', { hasText: 'Sunny Market Day' })
  await expect(sunnyRow).toBeVisible()
  await expect(sunnyRow.locator('.weather-badge--compact')).toBeVisible()
  await expect(sunnyRow.locator('.weather-badge-icon')).toHaveText('☀️')

  const rainyRow = page.locator('.ev', { hasText: 'Rainy Outdoor Movie' })
  await expect(rainyRow.locator('.weather-badge-icon')).toHaveText('🌧️')

  // The staleness guard: a 72h-old forecast renders NO badge.
  const staleRow = page.locator('.ev', { hasText: 'Stale Forecast Fair' })
  await expect(staleRow).toBeVisible()
  await expect(staleRow.locator('.weather-badge')).toHaveCount(0)

  await screenshotStable(page, 'e2e/screenshots/weather-badge-list.png', { fullPage: true })
})

test('detail hero shows the full badge; popup carries confidence receipts', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  await page.locator('.ev', { hasText: 'Rainy Outdoor Movie' }).click()

  // Full badge in the hero: temp + precipitation percentage (medium tier).
  const badge = page.locator('.a-hero .weather-badge')
  await expect(badge).toBeVisible()
  await expect(badge.locator('.weather-badge-text')).toHaveText('55° · 70% rain')

  // Popup receipts: conditions, medium-confidence note, as-of stamp. The
  // provider attribution deliberately does NOT ride every popup — it lives
  // once on the You tab (asserted below).
  await badge.click()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('rain, 48–55°, 70% chance of precipitation')
  await expect(tip).toContainText('check closer to the date')
  await expect(tip).toContainText('Forecast as of')
  await expect(tip).not.toContainText('Open-Meteo')

  await screenshotStable(page, 'e2e/screenshots/weather-badge-detail-popup.png', { fullPage: true })
})

test('Open-Meteo attribution lives on the You tab', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'You' }).click()
  const credit = page.getByText(/Weather forecasts by/)
  await expect(credit).toBeVisible()
  await expect(credit.getByRole('link', { name: 'Open-Meteo' })).toHaveAttribute('href', 'https://open-meteo.com/')

  await screenshotStable(page, 'e2e/screenshots/weather-attribution-you-tab.png', { fullPage: true })
})

test('low-confidence badge tempers the numbers: "rain possible", dashed styling', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  await page.locator('.ev', { hasText: 'Long Range Garden Walk' }).click()

  const badge = page.locator('.a-hero .weather-badge--low')
  await expect(badge).toBeVisible()
  await expect(badge.locator('.weather-badge-text')).toHaveText('68° · rain possible')

  await badge.click()
  await expect(page.getByRole('tooltip')).toContainText('Long-range outlook — low confidence')

  await screenshotStable(page, 'e2e/screenshots/weather-badge-detail-low-confidence.png', { fullPage: true })
})
