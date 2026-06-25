import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Discover has two segmented tabs — Calendars (venues) and Events — and a
// single search box. A query like "jazz" matches no venue names/tags but does
// match events, so a user sitting on the default Calendars tab would otherwise
// see "No calendars match" and assume the whole site is empty. This suite
// covers the three cooperating cues that fix that, in BOTH directions:
//   B. smart default — a new search lands on whichever tab actually has results
//   A. cross-tab empty state — the dead-end tab offers a CTA to the other tab
//   D. cross-tab hint — when both tabs match, the active list flags the other
//
// Fixtures (see fixtures.js): calendars "Neumos" (Music, Capitol Hill) + "SIFF"
// (Movies); events "Jazz Night" (cal1) and "Movie Premiere" (cal2). Fuse
// searches event summary/description/location; channel search is substring over
// name/tags.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

const seg = (page, name) => page.locator('.a-seg button', { hasText: name })
const SEARCH = 'Search events & venues…'

test('B: a new search lands on the tab that has results (venue-less query)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()
  // Cold load starts on Calendars.
  await expect(seg(page, 'Calendars')).toHaveClass(/on/)

  // "jazz" matches 0 calendars but 1 event → smart default flips to Events.
  await page.getByPlaceholder(SEARCH).fill('jazz')
  await expect(seg(page, 'Events')).toHaveClass(/on/)
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toHaveCount(0)
})

test('A: an empty Calendars tab offers a CTA to the matching Events', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  // Search "jazz", then deliberately go back to Calendars — a manual pick the
  // smart default must respect (not re-flip), landing the user on the dead-end
  // tab that the CTA then rescues.
  await page.getByPlaceholder(SEARCH).fill('jazz')
  await expect(seg(page, 'Events')).toHaveClass(/on/)
  await seg(page, 'Calendars').click()
  await expect(seg(page, 'Calendars')).toHaveClass(/on/)

  const cta = page.locator('.a-crossempty')
  await expect(cta).toContainText('No calendars match')
  const toEvents = cta.getByRole('button', { name: /See 1 event/ })
  await expect(toEvents).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/cross-tab-empty-calendars.png' })

  await toEvents.click()
  await expect(seg(page, 'Events')).toHaveClass(/on/)
  await expect(page.getByText('Jazz Night')).toBeVisible()
})

test('A (mirror): an empty Events tab offers a CTA to the matching Calendars', async ({ page }) => {
  // Override the events index so NO event matches the venue-only query "Music"
  // (the default Jazz Night carries "jazz"/"Neumos" but, more to the point, this
  // keeps Events deterministically empty). Isolated to this spec so other specs'
  // counts are untouched.
  const eventsOnlySiff = [
    { icsUrl: 'test-ripper-cal2.ics', summary: 'Movie Premiere', description: 'A film', location: 'SIFF', date: new Date(Date.now() + 3 * 864e5).toISOString() },
  ]
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/events-index-soon.json', (route) => route.fulfill(json(eventsOnlySiff)))
  await page.route('**/events-index.json', (route) => route.fulfill(json(eventsOnlySiff)))

  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  // "Music" matches the Neumos venue (its Music tag) but no event → Calendars
  // has 1, Events has 0. Smart default keeps the user on the non-empty Calendars.
  await page.getByPlaceholder(SEARCH).fill('Music')
  // Wait for the (debounced) query to actually commit before interacting, so the
  // manual tab switch below isn't raced by a late smart-default pass.
  await expect(page.getByText(/Searching:/)).toBeVisible()
  await expect(seg(page, 'Events').locator('.a-seg-count')).toHaveText('0')
  await expect(seg(page, 'Calendars')).toHaveClass(/on/)
  // Switch to the empty Events tab to surface its CTA.
  await seg(page, 'Events').click()

  const cta = page.locator('.a-crossempty')
  await expect(cta).toContainText('No events match')
  const toCalendars = cta.getByRole('button', { name: /See 1 calendar/ })
  await expect(toCalendars).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/cross-tab-empty-events.png' })

  await toCalendars.click()
  await expect(seg(page, 'Calendars')).toHaveClass(/on/)
})

test('D: when both tabs match, the active list flags the other tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  // "capitol" matches the Neumos venue (Capitol Hill tag) AND the Jazz Night
  // event (location "Neumos, Capitol Hill"). Both tabs are non-empty, so the
  // smart default leaves the user on Calendars and the hint points at Events.
  await page.getByPlaceholder(SEARCH).fill('capitol')
  await expect(seg(page, 'Calendars')).toHaveClass(/on/)
  await expect(page.getByText('Neumos')).toBeVisible()

  const hint = page.locator('.a-crosshint')
  await expect(hint).toContainText('also match')
  await expect(hint).toContainText('event')
  // The inactive (Events) badge is drawn loud.
  await expect(seg(page, 'Events').locator('.a-seg-count--cross')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/cross-tab-hint.png' })

  // Tapping the hint switches to Events; now the hint mirrors back to Calendars.
  await hint.click()
  await expect(seg(page, 'Events')).toHaveClass(/on/)
  await expect(page.locator('.a-crosshint')).toContainText('calendar')
  await expect(seg(page, 'Calendars').locator('.a-seg-count--cross')).toBeVisible()
})
