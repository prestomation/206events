// Deterministic screenshots for the committed e2e/screenshots/ set.
//
// A bare page.screenshot() right after a locator assertion races everything
// that settles AFTER the asserted element appears: web-font swaps, event
// thumbnails, Leaflet tile loads, and (since the marker layer mounts in a
// deferred transition — docs/web-tab-switch-performance.md Fix 3) the map
// pins themselves. These images are review documentation embedded in PR
// bodies, so a half-rendered capture reads as a broken UI.
//
// screenshotStable() waits for the RENDERED page to settle, never for data:
// it must not use networkidle or similar, because some specs deliberately
// hold a data response open while capturing (see payload-split.spec.js).
import { expect } from '@playwright/test'

export async function screenshotStable(page, path, opts = {}) {
  const { fullPage = false, expectMarkers = false } = opts

  // Fonts: a capture mid font-swap renders fallback metrics.
  await page.evaluate(() => document.fonts.ready)

  // Images: every <img> settled. `complete` is true for both loaded and
  // failed images, so a dead src can't hang the wait.
  await page.waitForFunction(() => [...document.images].every((img) => img.complete))

  // Leaflet: every VISIBLE map (the Fix 2 keep-alive can hold a hidden one)
  // must have all of its requested tiles resolved. Tiles are mocked in
  // installDataMocks, so this settles fast and deterministically.
  const visibleMaps = await page.locator('.leaflet-container:visible').count()
  if (visibleMaps > 0) {
    await page.waitForFunction(() => {
      const shown = [...document.querySelectorAll('.leaflet-container')]
        .filter((c) => c.getBoundingClientRect().width > 0)
      return shown.every((c) => {
        const tiles = [...c.querySelectorAll('.leaflet-tile')]
        return tiles.length > 0 && tiles.every((t) => t.classList.contains('leaflet-tile-loaded'))
      })
    })
    // Pins mount a beat after the map shell (deferred transition). Only
    // opt-in — some captures legitimately show an empty map.
    if (expectMarkers) {
      await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible()
    }
  }

  // Double rAF: everything above has been committed AND painted.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  await page.screenshot({ path, fullPage })
}
