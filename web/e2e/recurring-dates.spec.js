import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { mockRecurringEvents } from './fixtures.js'

// Verifies the "Other dates" section on the event detail page: recurring events
// that aren't modeled as recurring (independent dated instances at one venue)
// are re-linked at display time via the shared `groupKey` heuristic, so opening
// one occurrence surfaces the others. Also captures a committed screenshot (per
// AGENTS.md "UI Changes" rule) so reviewers see the rendered section.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Override both events routes with the recurring fixtures (kept out of the
  // shared mockEvents so other specs' counts are unaffected). Later route wins.
  await page.route('**/events-index-soon.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRecurringEvents) }))
  await page.route('**/events-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRecurringEvents) }))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('lists sibling occurrences of an un-modeled recurring event', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  // Open the soonest trivia occurrence from the list.
  await page.locator('.ev', { hasText: 'Tuesday Trivia Night' }).first().click()

  // The detail page has an "Other dates" section…
  await expect(page.getByText('OTHER DATES', { exact: true })).toBeVisible()

  // …listing the OTHER three occurrences (4 total in the series minus the one
  // we're viewing). The same-titled event at a different venue (cal2) shares the
  // title but has a different groupKey, so it is NOT folded in here.
  await expect(page.locator('.ev', { hasText: 'Tuesday Trivia Night' })).toHaveCount(3)

  // The different-title event at the same venue belongs under "More from", not
  // "Other dates".
  await expect(page.getByText(/MORE FROM/)).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Open Mic' })).toHaveCount(1)

  await page.screenshot({ path: 'e2e/screenshots/event-detail-other-dates.png', fullPage: true })
})

test('clicking an other-date navigates to that occurrence', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()
  await page.locator('.ev', { hasText: 'Tuesday Trivia Night' }).first().click()

  const heroKick = page.locator('.a-hero-kick')
  const firstDate = await heroKick.textContent()

  // Jump to a different occurrence via the "Other dates" list.
  await page.locator('.ev', { hasText: 'Tuesday Trivia Night' }).first().click()

  // The hero now reflects a different date, and the section still lists three
  // siblings (the newly-opened occurrence is now excluded instead).
  await expect(heroKick).not.toHaveText(firstDate ?? '')
  await expect(page.getByText('OTHER DATES', { exact: true })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Tuesday Trivia Night' })).toHaveCount(3)
})
