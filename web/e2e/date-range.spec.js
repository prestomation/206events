import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Verifies the custom date-range filter (FilterPopover "OR PICK DATES" → native
// From/To inputs): picking explicit calendar dates narrows the events list to
// that inclusive range, surfaces a range chip, and round-trips through the URL
// (`date=START..END`) so the filtered view is shareable. Also captures committed
// screenshots (per AGENTS.md "UI Changes" rule) of the popover and the result.

// Build an events-index date string `days` from today at 19:30 local, plus the
// 'YYYY-MM-DD' form the <input type="date"> and URL token use.
function future(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(19, 30, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { d, ymd, iso: `${ymd}T19:30:00` }
}

// Four events spread across the upcoming window. The range picked below
// (day 40 → day 42) brackets exactly the two "Visitor" shows.
const EARLY = future(10)
const IN_A = future(40)
const IN_B = future(42)
const LATE = future(70)

const EVENTS = [
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Early Bird Show', description: 'x', location: 'Neumos, Capitol Hill', date: EARLY.iso },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Visitor Day One', description: 'x', location: 'Neumos, Capitol Hill', date: IN_A.iso },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Visitor Day Three', description: 'x', location: 'Neumos, Capitol Hill', date: IN_B.iso },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Way Later Show', description: 'x', location: 'Neumos, Capitol Hill', date: LATE.iso },
]

// The chip's start label mirrors describeWindow's "MMM D" (same locale call).
const startLabel = IN_A.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  // Isolated fixtures (kept out of the shared mockEvents so other specs' counts
  // are unaffected). Later route wins; cover both two-phase endpoints.
  const body = JSON.stringify(EVENTS)
  await page.route('**/events-index-soon.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body }))
  await page.route('**/events-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body }))

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('narrows the events list to a picked From/To range', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()

  // Baseline: all four upcoming events render.
  await expect(page.locator('.ev', { hasText: 'Early Bird Show' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Visitor Day One' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Visitor Day Three' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Way Later Show' })).toBeVisible()

  // Open the date filter; the new "OR PICK DATES" inputs are present and empty.
  await page.getByRole('button', { name: 'Filter by date' }).click()
  await expect(page.getByText('OR PICK DATES', { exact: true })).toBeVisible()
  const from = page.getByLabel('From date')
  const to = page.getByLabel('To date')
  await expect(from).toHaveValue('')
  await expect(to).toHaveValue('')
  await page.screenshot({ path: 'e2e/screenshots/date-range-popover.png' })

  // Pick the visitor's days. The filter applies once both ends are set.
  await from.fill(IN_A.ymd)
  await to.fill(IN_B.ymd)
  await page.screenshot({ path: 'e2e/screenshots/date-range-filled.png' })

  // Close the popover (Done) and confirm the list is now just the two in-range
  // shows; the early and late ones are filtered out.
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.ev', { hasText: 'Visitor Day One' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Visitor Day Three' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Early Bird Show' })).toHaveCount(0)
  await expect(page.locator('.ev', { hasText: 'Way Later Show' })).toHaveCount(0)

  // The active-filter chip reflects the picked range (starts with "MMM D").
  await expect(page.locator('.a-activefilters')).toContainText(startLabel)

  await page.screenshot({ path: 'e2e/screenshots/date-range-result.png', fullPage: true })
})

test('round-trips a custom range through the URL (shareable link)', async ({ page }) => {
  // Deep-link straight into the events list with a custom range token.
  await page.goto(`/#emphasis=events&date=${IN_A.ymd}..${IN_B.ymd}`)

  await expect(page.locator('.ev', { hasText: 'Visitor Day One' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Visitor Day Three' })).toBeVisible()
  await expect(page.locator('.ev', { hasText: 'Early Bird Show' })).toHaveCount(0)
  await expect(page.locator('.ev', { hasText: 'Way Later Show' })).toHaveCount(0)

  // The popover reflects the URL-sourced range in its inputs.
  await page.getByRole('button', { name: 'Filter by date' }).click()
  await expect(page.getByLabel('From date')).toHaveValue(IN_A.ymd)
  await expect(page.getByLabel('To date')).toHaveValue(IN_B.ymd)
})
