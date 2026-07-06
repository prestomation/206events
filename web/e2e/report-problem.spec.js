import { test, expect } from '@playwright/test'
import { installDataMocks, overrideEventsIndex } from './mock-routes.js'
import { screenshotStable } from './screenshot.js'

// The "Report a problem" button on the event and venue (channel) detail pages
// opens the feedback modal pre-filled with what the user is looking at (event
// title + date + source, or the source) and an editable template message, so a
// wrong time/location/duplicate can be reported in one tap.
//
// We assert the pre-fill by driving the modal through the GitHub 503 fallback
// path (same technique as feedback-fallback.spec.js): the fallback builds a
// prefilled new-issue URL whose body mirrors what the worker would file, so a
// single assertion covers both the modal state and the outgoing context.
// window.open is captured so no real github.com tab spawns and the suite stays
// hermetic. Fixtures are local route overrides so other specs' counts are
// untouched (AGENTS.md hermetic-suite rule).

function toJoda(date) {
  const p = (n) => String(n).padStart(2, '0')
  const off = -date.getTimezoneOffset()
  const s = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:00${s}${p(Math.floor(a / 60))}:${p(a % 60)}`
}
const future = (days, h = 19, m = 30) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(h, m, 0, 0)
  return d
}

const reportEvents = [
  {
    icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night',
    description: 'Live jazz at the club.', location: 'Neumos, Capitol Hill',
    date: toJoda(future(2)), lat: 47.61, lng: -122.32, url: 'https://example.com/jazz-night',
  },
]

test.beforeEach(async ({ page }) => {
  await installDataMocks(page)
  await overrideEventsIndex(page, reportEvents)
  // Worker reachable but feedback route not configured -> 503 -> GitHub hand-off.
  await page.route('**/feedback', (r) =>
    r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Feedback is not configured"}' }))

  // Record the URL the app tries to open and suppress the real navigation.
  await page.addInitScript(() => {
    window.__opened = []
    window.open = (url) => { window.__opened.push(String(url)); return null }
  })

  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  page.__pageErrors = pageErrors
})

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors ?? [], 'no uncaught page errors').toEqual([])
})

test('event page: Report a problem pre-fills event identity + template message', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Events', { exact: true }).first().click()
  await page.locator('.ev', { hasText: 'Jazz Night' }).first().click()

  // The button lives on the event detail page.
  const report = page.getByRole('button', { name: 'Report a problem' })
  await expect(report).toBeVisible()
  await screenshotStable(page, 'e2e/screenshots/event-detail-report-button.png', { fullPage: true })

  await report.click()
  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  await expect(dialog).toBeVisible()
  // "Report a problem" (bug) type is preselected.
  await expect(dialog.getByRole('button', { name: 'Report a problem' })).toHaveAttribute('aria-pressed', 'true')
  // The context chip names the event, and the message box carries the template.
  await expect(dialog.locator('.a-modal-context')).toContainText('Jazz Night')
  await expect(dialog.getByRole('textbox').first()).toHaveValue(/Problem with "Jazz Night"/)
  await screenshotStable(page, 'e2e/screenshots/report-modal-from-event.png')

  // Submit as-is: the 503 fallback opens a prefilled GitHub issue whose body
  // carries the structured event identity.
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog).toBeHidden()
  const opened = await page.evaluate(() => window.__opened)
  expect(opened).toHaveLength(1)
  const url = new URL(opened[0])
  expect(url.pathname).toContain('/issues/new')
  expect(url.searchParams.get('title')).toContain('[Bug]')
  expect(url.searchParams.get('title')).toContain('Jazz Night')
  const body = url.searchParams.get('body')
  expect(body).toContain('**Event:** Jazz Night')
  expect(body).toContain('**Date:**')
  expect(body).toContain('Problem with "Jazz Night"')
})

test('venue page: Report a problem pre-fills the source + template message', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Calendars', { exact: true }).first().click()
  await page.locator('.ch', { hasText: 'Neumos' }).first().click()

  const report = page.getByRole('button', { name: 'Report a problem' })
  await expect(report).toBeVisible()
  await report.click()

  const dialog = page.getByRole('dialog', { name: 'Send feedback' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.a-modal-context')).toContainText('Neumos')
  await expect(dialog.getByRole('textbox').first()).toHaveValue(/Problem with Neumos/)
  await screenshotStable(page, 'e2e/screenshots/report-modal-from-venue.png')

  await dialog.getByRole('button', { name: 'Send' }).click()
  // The 503 hand-off is async (POST → fallback → window.open → close); the
  // dialog closing is the signal that window.open has already fired.
  await expect(dialog).toBeHidden()
  const opened = await page.evaluate(() => window.__opened)
  expect(opened).toHaveLength(1)
  const url = new URL(opened[0])
  const body = url.searchParams.get('body')
  expect(body).toContain('**Source:** Neumos')
  expect(url.searchParams.get('title')).toContain('[Bug]')
})
