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
