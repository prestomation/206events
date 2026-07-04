import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockCostEvents } from './fixtures.js'
import { screenshotStable } from './screenshot.js'

// Verifies the cost label/styling for every `cost` shape, with emphasis on the
// new `{ soldOut: true }` state — a sold-out show must read "Sold out" (not
// "Free", the bug this work fixes), in the list and on the detail page.
// Captures committed screenshots per AGENTS.md "UI Changes".

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Override events-index with the cost fixtures (kept out of the shared
  // mockEvents so other specs' counts are unaffected). Later route wins.
  await page.route('**/events-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostEvents) }))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('renders the correct cost label and styling for each shape in the list', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  const soldOutRow = page.locator('.ev', { hasText: 'Sold Out Show' })
  const freeRow = page.locator('.ev', { hasText: 'Free Show' })
  const pricedRow = page.locator('.ev', { hasText: 'Priced Show' })
  const ticketedRow = page.locator('.ev', { hasText: 'Ticketed Show' })

  // Sold out: reads "Sold out", carries the --soldout modifier, and is NOT
  // styled as free (the regression this work guards against).
  const soldOutCost = soldOutRow.locator('.ev-cost')
  await expect(soldOutCost).toHaveText('Sold out')
  await expect(soldOutCost).toHaveClass(/ev-cost--soldout/)
  await expect(soldOutCost).not.toHaveClass(/ev-cost--free/)

  // Free: reads "Free", carries the --free modifier only.
  const freeCost = freeRow.locator('.ev-cost')
  await expect(freeCost).toHaveText('Free')
  await expect(freeCost).toHaveClass(/ev-cost--free/)

  // Priced range: "From $25", no special modifier.
  await expect(pricedRow.locator('.ev-cost')).toHaveText('From $25')
  // Paid, amount unknown: "Ticketed".
  await expect(ticketedRow.locator('.ev-cost')).toHaveText('Ticketed')

  await screenshotStable(page, 'e2e/screenshots/cost-list-shapes.png', { fullPage: true })
})

test('shows "Sold out" with a helpful sub-line on the detail page', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  await page.locator('.ev', { hasText: 'Sold Out Show' }).click()

  // "Sold out" appears in both the hero chip and the price fact.
  await expect(page.getByText('Sold out', { exact: true }).first()).toBeVisible()
  // The price fact carries the resale/waitlist hint.
  await expect(page.getByText(/No longer on sale — check the event site/)).toBeVisible()
  // It must NOT say Free anywhere on the detail.
  await expect(page.getByText('Free', { exact: true })).toHaveCount(0)

  await screenshotStable(page, 'e2e/screenshots/event-detail-sold-out.png', { fullPage: true })
})
