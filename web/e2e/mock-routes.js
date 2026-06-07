import {
  mockManifest,
  mockEvents,
  mockVenues,
  mockBuildErrors,
  mockIcs,
} from './fixtures.js'

// Register browser-level network stubs for every runtime fetch the app makes,
// so the suite is hermetic (no calendar generation, no live network, no
// favorites API). Mirrors the `mockFetch` switch in web/src/App.test.jsx.
export async function installDataMocks(page) {
  // Start every spec as a returning visitor: pre-set the first-run flag so the
  // FTUX welcome modal (a deliberate first-visit-only overlay) doesn't appear
  // and intercept clicks. addInitScript runs before the app's scripts on each
  // navigation. These flows exercise the main UI, not onboarding.
  await page.addInitScript(() => {
    try { localStorage.setItem('calendar-ripper-ftux-seen', '1') } catch { /* ignore */ }
  })

  const json = (body) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

  await page.route('**/manifest.json', (route) => route.fulfill(json(mockManifest)))
  await page.route('**/events-index.json', (route) => route.fulfill(json(mockEvents)))
  await page.route('**/venues.json', (route) => route.fulfill(json(mockVenues)))
  await page.route('**/build-errors.json', (route) => route.fulfill(json(mockBuildErrors)))
  await page.route('**/tags.json', (route) => route.fulfill(json([])))

  await page.route('**/*.ics', (route) =>
    route.fulfill({ status: 200, contentType: 'text/calendar', body: mockIcs }))

  // Favorites API: respond as logged-out so the app renders deterministically.
  await page.route('**/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await page.route('**/favorites', (route) => route.fulfill(json([])))
  await page.route('**/favorites/**', (route) => route.fulfill(json({})))
  await page.route('**/search-filters', (route) => route.fulfill(json([])))
  await page.route('**/search-filters/**', (route) => route.fulfill(json({})))
  await page.route('**/geo-filters', (route) => route.fulfill(json([])))
  await page.route('**/geo-filters/**', (route) => route.fulfill(json({})))
}

// Logged-in variant: stub auth/me to return a user and /lists to return canned
// lists, plus accept the per-list mutation calls. No real OAuth/cookies — the
// client trusts the auth/me JSON. Requires the bundle to be built with
// VITE_FAVORITES_API_URL set (see playwright.config.js) so the app issues these
// calls in the first place. Call this AFTER installDataMocks to override the
// logged-out auth/me + favorites routes.
export async function installLoggedInMocks(page, { lists, apiBase = 'https://api.test' } = {}) {
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  const user = { id: 'u1', name: 'Test User', email: 't@e.com', picture: '', feedToken: 'tok1', feedUrl: `${apiBase}/feed/tok1.ics` }
  const listData = lists || [
    { id: 'default', name: 'My Favorites', feedUrl: `${apiBase}/feed/tok1.ics`, icsUrls: [], searchFilters: [], geoFilters: [] },
    { id: 'date-night', name: 'Date Night', feedUrl: `${apiBase}/feed/tok2.ics`, icsUrls: [], searchFilters: [], geoFilters: [] },
  ]

  await page.route('**/auth/me', (route) => route.fulfill(json({ user })))
  // GET /lists → list set; POST /lists → echo a created list.
  await page.route('**/lists', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill(json({ list: { id: 'new-list', name: 'New', feedUrl: `${apiBase}/feed/tok3.ics`, icsUrls: [], searchFilters: [], geoFilters: [] } }))
    }
    return route.fulfill(json({ lists: listData, updatedAt: '' }))
  })
  // Per-list item + rename/delete calls — accept everything.
  await page.route('**/lists/**', (route) => route.fulfill(json({ ok: true })))
}
