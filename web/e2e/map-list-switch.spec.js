import { test, expect } from '@playwright/test'
import { installDataMocks, installLoggedInMocks } from './mock-routes.js'

// Regression test for: the favorites-list "Saving to" dropdown is unusable on
// the Map view. The menu opens, but Leaflet's map controls (the zoom +/−
// buttons, z-index 1000) render ON TOP of the menu (z-index 72), covering the
// left edge of every option. On a phone the option text is clipped ("y
// Favorites", "ate Night") and tapping an option's left side hits the zoom
// control instead — so the dropdown appears not to work / not to open. Only the
// Map view has Leaflet controls, which is why other tabs are unaffected.
const lists = [
  { id: 'default', name: 'My Favorites', feedUrl: 'https://api.test/feed/tok1.ics', icsUrls: ['test-ripper-cal1.ics'], searchFilters: [], geoFilters: [] },
  { id: 'date-night', name: 'Date Night', feedUrl: 'https://api.test/feed/tok2.ics', icsUrls: ['test-ripper-cal2.ics'], searchFilters: [], geoFilters: [] },
]

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  await installLoggedInMocks(page, { lists })
})

// Phone viewport: the Map is its own bottom-nav tab and the menu drops as a
// near-full-width sheet that overlaps the map (and its top-left zoom control).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test('the list dropdown is not covered by map controls on the Map view', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  // Signed-in multi-list path requires the bundle built with
  // VITE_FAVORITES_API_URL (see playwright.config.js). Skip if inactive.
  const btn = page.locator('.a-savingto > .a-dd-btn')
  test.skip(!(await btn.isVisible().catch(() => false)), 'bundle built without VITE_FAVORITES_API_URL — multi-list path inactive')

  // Open the Map tab and the "Saving to" dropdown.
  await page.getByRole('navigation').getByRole('button', { name: 'Map' }).first().click()
  await expect(page.locator('.events-map-container:visible .events-map').first()).toBeVisible()
  await page.waitForTimeout(400)

  await btn.click()
  const menu = page.locator('.a-savingto .a-dd-menu')
  await expect(menu).toBeVisible()

  // Every option must be the topmost element across its full width — including
  // the left edge, where the Leaflet zoom control sits. If a Leaflet control is
  // on top anywhere over an option, the dropdown is occluded and effectively
  // broken on the map.
  const options = page.getByRole('option')
  const count = await options.count()
  expect(count).toBe(2)
  for (let i = 0; i < count; i++) {
    const occluder = await options.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect()
      // Sample several points across the row, biased toward the left edge where
      // the map's zoom control overlaps.
      const xs = [r.left + 10, r.left + 24, r.left + r.width * 0.25, r.left + r.width / 2]
      const y = r.top + r.height / 2
      for (const x of xs) {
        const top = document.elementFromPoint(x, y)
        if (top && top.closest('.leaflet-control-container, .leaflet-control')) {
          return { x: Math.round(x), y: Math.round(y), tag: `${top.tagName}.${(top.className?.toString?.() || '').slice(0, 40)}` }
        }
      }
      return null
    })
    expect(occluder, `option ${i} is covered by a Leaflet map control at ${JSON.stringify(occluder)}`).toBeNull()
  }
})
