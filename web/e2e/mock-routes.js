import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  mockManifest,
  mockEvents,
  mockVenues,
  mockBuildErrors,
  mockIcs,
} from './fixtures.js'

// Real OSM raster tiles committed as fixtures (see e2e/tiles/README.md), so
// map screenshots show an actual rendered map while the suite stays hermetic
// (no third-party requests at test time). Keyed by tile path, ignoring the
// {a,b,c} subdomain. Cached after first read.
const TILES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tiles')
const MISSING_TILES_LOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'missing-tiles.log')
const tileCache = new Map()

// Fallback for tile coordinates not covered by the fixtures: a 256×256 solid
// pale-green (#e2eadd) PNG. Deliberately NOT Leaflet's #ddd pane color, so a
// capture where fixtures are missing (viewport/zoom drift after a fixture or
// spec change) is visually obvious — refetch with:
//   node scripts/fetch-map-tiles.mjs   (reads test-results/missing-tiles.log)
const MOCK_TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACAElEQVR42u3TMQ0AAAgEsffvkYURFcxooEkVXHLpKXgrEmAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAOogAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAANgABUwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADIABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA8C1+Bcn6Cl9RbkAAAAASUVORK5CYII=',
  'base64')

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
  // Two-phase events load (issue 649): the app fetches the small "soon" payload
  // first, then the full index. Serve the same fixture for both by default so
  // the shared specs see a complete dataset regardless of timing.
  await page.route('**/events-index-soon.json', (route) => route.fulfill(json(mockEvents)))
  await page.route('**/events-index.json', (route) => route.fulfill(json(mockEvents)))
  await page.route('**/venues.json', (route) => route.fulfill(json(mockVenues)))
  await page.route('**/build-errors.json', (route) => route.fulfill(json(mockBuildErrors)))
  await page.route('**/tags.json', (route) => route.fulfill(json([])))

  await page.route('**/*.ics', (route) =>
    route.fulfill({ status: 200, contentType: 'text/calendar', body: mockIcs }))

  // Map tiles: serve committed fixture tiles (real OSM imagery) for every
  // tile request, falling back to the pale-green placeholder for uncovered
  // coordinates. Keeps the suite hermetic (no third-party requests, no
  // network-dependent flakiness) and makes map screenshots deterministic AND
  // real-looking (see e2e/screenshot.js, which waits for .leaflet-tile-loaded
  // and relies on tiles resolving instantly). Uncovered tile paths are
  // appended to test-results/missing-tiles.log so `node
  // scripts/fetch-map-tiles.mjs` can backfill them after a spec change.
  await page.route('https://*.tile.openstreetmap.org/**', (route) => {
    const m = new URL(route.request().url()).pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/)
    const key = m ? `${m[1]}-${m[2]}-${m[3]}` : null
    if (key && !tileCache.has(key)) {
      const file = join(TILES_DIR, `${key}.png`)
      tileCache.set(key, existsSync(file) ? readFileSync(file) : null)
      if (tileCache.get(key) === null) {
        try {
          mkdirSync(dirname(MISSING_TILES_LOG), { recursive: true })
          appendFileSync(MISSING_TILES_LOG, `${m[1]}/${m[2]}/${m[3]}\n`)
        } catch { /* recording is best-effort */ }
      }
    }
    const body = (key && tileCache.get(key)) || MOCK_TILE_PNG
    return route.fulfill({ status: 200, contentType: 'image/png', body })
  })

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
