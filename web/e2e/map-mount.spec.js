import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Perf guard: the persistent desktop map column (.a-map) is shown by CSS only
// at >= 1024px, but it used to stay MOUNTED at every width — so phones and
// tablets initialized Leaflet and ran the full marker pipeline over the whole
// events index for a panel they can never see (and mounted a SECOND instance
// when the Map tab was opened). These specs pin the fix: below the desktop
// breakpoint no Leaflet exists until the user opens the Map tab, and then
// exactly one instance does; at desktop the persistent column still renders.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
})

test.describe('mobile (< 768px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('no map is mounted until the Map tab opens the single instance', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Jazz Night').first()).toBeVisible()

    // The hidden desktop column must not exist, and no Leaflet has booted.
    await expect(page.locator('.a-map')).toHaveCount(0)
    await expect(page.locator('.leaflet-container')).toHaveCount(0)

    // Opening the Map tab mounts exactly one map.
    await page.getByRole('button', { name: 'Map' }).click()
    await expect(page.locator('.events-map')).toBeVisible()
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
    await page.screenshot({ path: 'e2e/screenshots/map-mount-mobile-tab.png' })
  })
})

test.describe('tablet (768–1023px)', () => {
  test.use({ viewport: { width: 900, height: 1200 } })

  test('map column is unmounted, Map tab still available', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Jazz Night').first()).toBeVisible()

    await expect(page.locator('.a-map')).toHaveCount(0)
    await expect(page.locator('.leaflet-container')).toHaveCount(0)

    await page.getByRole('button', { name: 'Map' }).click()
    await expect(page.locator('.events-map')).toBeVisible()
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
  })
})

test.describe('desktop (>= 1024px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('persistent map column mounts alongside the content', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Jazz Night').first()).toBeVisible()

    await expect(page.locator('.a-map .events-map')).toBeVisible()
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
    await page.screenshot({ path: 'e2e/screenshots/map-mount-desktop.png' })
  })
})
