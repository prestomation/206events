import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// Live search is deferred (useDeferredValue in App206) so the expensive Fuse
// pass + dependent re-renders run at low priority and never block typing. This
// asserts the search still converges to the right filtered set and that the
// active-filter chip reflects the committed query. Behavior is unchanged from
// the user's perspective; the win is that the work no longer freezes the frame.

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('deferred search converges to the filtered set and is clearable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  await page.getByText('Events', { exact: true }).first().click()
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toBeVisible()

  // Type a query. The deferred match-set settles asynchronously; Playwright's
  // web-first assertions retry until it lands, which is exactly the deferred
  // path we want to exercise (no synchronous freeze). The input is uncontrolled
  // (DOM-owned) — assert it reflects exactly what was typed.
  const input = page.getByPlaceholder('Search events & venues…')
  await input.fill('jazz')
  await expect(input).toHaveValue('jazz')
  await expect(page.getByText(/Searching:/)).toBeVisible()
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toHaveCount(0)

  await screenshotStable(page, 'e2e/screenshots/search-deferred.png')

  // The input stays interactive: clearing via the chip ✕ (an EXTERNAL query
  // change) must push back into the uncontrolled input via the ref — the field
  // empties and the full list returns.
  await page.locator('.a-fchip--search button.a-fchip-x').click()
  await expect(input).toHaveValue('')
  await expect(page.getByText('Movie Premiere')).toBeVisible()
})

test('deferred search also filters the Following feed', async ({ page }) => {
  // Following only filters via app.matchEvents/app.queryKeySet, which now lag
  // app.query (deferred). Seed the local feed with both calendars so the search
  // has something to narrow, then assert it converges — guards the FollowingView
  // memo's dependency on the deferred queryKeySet.
  await page.addInitScript(() => {
    localStorage.setItem('calendar-ripper-favorites', JSON.stringify(['test-ripper-cal1.ics', 'test-ripper-cal2.ics']))
    localStorage.setItem('calendar-ripper-ftux-seen', '1')
  })
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  await page.getByText('Following', { exact: true }).first().click()
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toBeVisible()

  await page.getByPlaceholder('Search events & venues…').fill('jazz')
  await expect(page.getByText('Jazz Night')).toBeVisible()
  await expect(page.getByText('Movie Premiere')).toHaveCount(0)
})
