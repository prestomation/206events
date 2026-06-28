import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Live search runs in a Web Worker, but the client falls back to a main-thread
// engine when Workers are unavailable (CSP, old browsers). The unit suite covers
// the fallback in jsdom; this proves it in a REAL browser by removing `Worker`
// before the app loads, then asserting search still filters correctly. Together
// with search-deferred.spec.js (real worker path) both branches are guarded
// in-browser.

test.beforeEach(async ({ page }) => {
  // Remove Worker before any app script runs → createSearchClient takes the
  // main-thread fallback (typeof Worker === 'undefined').
  await page.addInitScript(() => {
    try { delete window.Worker } catch { /* non-configurable: best effort */ }
    // eslint-disable-next-line no-global-assign
    window.Worker = undefined
  })
  await installDataMocks(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('search still filters with Workers unavailable (main-thread fallback)', async ({ page }) => {
  await page.goto('/')
  // Confirm the fallback is actually in force (no real Worker present).
  expect(await page.evaluate(() => typeof window.Worker === 'undefined' || window.Worker == null)).toBe(true)

  await expect(page.getByText('Neumos')).toBeVisible()
  await page.getByText('Events', { exact: true }).first().click()
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toBeVisible()

  const input = page.getByPlaceholder('Search events & venues…')
  await input.fill('jazz')
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toHaveCount(0)

  // Clearing restores the full list — fallback search is fully interactive.
  await page.locator('.a-fchip--search button.a-fchip-x').click()
  await expect(input).toHaveValue('')
  await expect(page.getByText('Movie Premiere')).toBeVisible()
})
