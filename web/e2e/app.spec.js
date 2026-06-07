import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// High-value, copy-resilient smoke paths for the 206.events web UI. Data is
// fully mocked (see mock-routes.js); these exercise the real built bundle in a
// real browser.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)

  // Fail any test that produces an uncaught page error.
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('boots and renders the channel list (past the loading splash)', async ({ page }) => {
  await page.goto('/')
  // Mocked channels resolve once data lands and the boot splash clears.
  await expect(page.getByText('Neumos')).toBeVisible()
  await expect(page.getByText('SIFF')).toBeVisible()
})

test('search filters the events list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  // Switch Discover into Events mode, then narrow with the single top-bar search.
  await page.getByText('Events', { exact: true }).first().click()
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toBeVisible()

  await page.getByPlaceholder('Search events & venues…').fill('jazz')
  await expect(page.getByText(/Searching:/)).toBeVisible()
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toHaveCount(0)
})

test('navigates between Discover, Following, and You views', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  await page.getByText('Following', { exact: true }).first().click()
  await expect(page.getByText('Build your feed')).toBeVisible()

  await page.getByText('You', { exact: true }).first().click()
  await expect(page.getByText('Saved searches', { exact: true })).toBeVisible()
  await expect(page.getByText('Location filters', { exact: true })).toBeVisible()
})

test('opens a channel detail with working subscribe links', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Neumos').click()

  await expect(page.getByText('Add to my calendar app')).toBeVisible()
  const subscribe = page.getByText('Add to my calendar app')
  await expect(subscribe).toHaveAttribute('href', /^webcal:/)
})
