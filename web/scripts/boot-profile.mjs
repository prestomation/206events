// Boot-interactivity profiling harness — measures post-splash main-thread
// health against a running deployment (PR preview or production). This is the
// productionized form of the harness that diagnosed and verified PR #835.
// Design and metric definitions: docs/web-boot-profiling-ci.md.
//
//   node scripts/boot-profile.mjs <url> [--runs 3] [--cpu 4] [--out metrics.json]
//                                       [--index-delay 2500] [--settle 12000]
//
// Per run: mobile viewport, N× CDP CPU throttle, long-task observer injected
// before any page script, service workers BLOCKED (sw.js precaches
// the events index and SW-originated fetches bypass route interception —
// with it active, the delay below is a race), and the full events corpus
// (events-index.ndjson, plus the monolithic fallback) delayed so the splash
// always dismisses on the "soon" payload first.
// Then: tap Following mid-swap (tapResponse), let the swap settle, snapshot
// long tasks, and finally exercise post-settle tab switches: first Map open
// from Discover (mapOpen), a second Map open after leaving the tab
// (mapReopen), and a Discover → You switch (youOpen).
//
// Each run then makes a SECOND pass with seeded personalization (a
// representative logged-in profile written to the app's own localStorage
// keys: 35 followed calendars pulled from the deployment's manifest, 14
// saved searches, 1 geo filter — the anonymous localStorage path exercises
// the identical perFilterMatches / followingGroups code as a signed-in
// list). It owns the two metrics the anonymous pass can't see
// (docs/following-tab-performance.md):
//   personalizedSettle — total long-task ms from nav through the settle
//     window with the profile seeded; the saved-search matching storm
//     lives here when it runs on the main thread.
//   followingOpen — post-settle Discover → Following switch with a
//     populated feed: tap → Following view painted.
//
// Emits { metrics, runs, meta } with each metric the MEDIAN across runs.
// Any run failure exits non-zero — a broken harness must not look green.

import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'

function parseArgs(argv) {
  const args = { runs: 3, cpu: 4, indexDelay: 2500, settle: 12000, out: null, url: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--runs') args.runs = Number(argv[++i])
    else if (a === '--cpu') args.cpu = Number(argv[++i])
    else if (a === '--index-delay') args.indexDelay = Number(argv[++i])
    else if (a === '--settle') args.settle = Number(argv[++i])
    else if (a === '--out') {
      args.out = argv[++i]
      if (!args.out || args.out.startsWith('--')) throw new Error('--out requires a file path')
    }
    else if (!a.startsWith('--') && !args.url) args.url = a
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (!args.url) throw new Error('Usage: node scripts/boot-profile.mjs <url> [--runs N] [--cpu N] [--out file]')
  for (const k of ['runs', 'cpu', 'indexDelay', 'settle']) {
    if (!Number.isFinite(args[k]) || args[k] <= 0) throw new Error(`--${k} must be a positive number`)
  }
  return args
}

export function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// The seeded personalization profile (docs/following-tab-performance.md):
// sized to the report that motivated the metrics — 33 calendars, 14 saved
// searches, 1 geo fence. Search terms are common Seattle-calendar words so
// they produce real match sets against the production corpus.
export const SEED_SEARCHES = [
  'jazz', 'trivia', 'farmers market', 'comedy', 'punk', 'film festival',
  'beer', 'art walk', 'poetry', 'karaoke', 'drag', 'vinyl', 'soccer', 'book club',
]
export const SEED_GEO = [{ lat: 47.6062, lng: -122.3321, radiusKm: 5, label: 'Boot-profile seed' }]
export const SEED_FAVORITES_COUNT = 35

// Pull real calendar icsUrls from the deployment's manifest so the seeded
// favorites reference calendars that actually exist in its events index.
export function seedFavoritesFromManifest(manifest, count = SEED_FAVORITES_COUNT) {
  const icsUrls = []
  for (const ripper of manifest.rippers || []) {
    for (const cal of ripper.calendars || []) if (cal.icsUrl) icsUrls.push(cal.icsUrl)
  }
  for (const cal of manifest.externalCalendars || []) if (cal.icsUrl) icsUrls.push(cal.icsUrl)
  for (const cal of manifest.recurringCalendars || []) if (cal.icsUrl) icsUrls.push(cal.icsUrl)
  if (!icsUrls.length) throw new Error('manifest.json has no calendar icsUrls to seed favorites from')
  return icsUrls.slice(0, count)
}

async function fetchSeedFavorites(url) {
  const base = url.endsWith('/') ? url : `${url}/`
  const res = await fetch(new URL('manifest.json', base))
  if (!res.ok) throw new Error(`manifest.json fetch for favorite seeding failed: HTTP ${res.status}`)
  return seedFavoritesFromManifest(await res.json())
}

// One measured pass. Returns the eight per-run metrics (ms, rounded).
async function profileOnce(browser, { url, cpu, indexDelay, settle }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block', // load-bearing — see header comment
  })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })

    await page.addInitScript(() => {
      // Returning visitor: the first-run welcome modal would intercept taps.
      try { localStorage.setItem('calendar-ripper-ftux-seen', '1') } catch { /* ignore */ }
      window.__longtasks = []
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__longtasks.push({ start: e.startTime, dur: e.duration })
        }).observe({ type: 'longtask', buffered: true })
      } catch { /* longtask API missing — metrics will be 0 and obviously wrong */ }
      // The swap-block wait reads the events-index resource entry; make
      // sure an image-heavy boot can't evict it from the default 250-entry
      // resource-timing buffer.
      try { performance.setResourceTimingBufferSize(1000) } catch { /* ignore */ }
    })

    // Delay ONLY the full corpus (the globs don't match events-index-soon.json),
    // pinning the production ordering: splash dismisses on soon, full lands later.
    // Both the NDJSON stream (preferred path, docs/event-payload-scaling.md) and
    // the monolithic events-index.json (fallback / pre-stream deploys) are
    // delayed so the choreography holds against either deploy generation.
    const delayRoute = async (route) => {
      await new Promise((r) => setTimeout(r, indexDelay))
      // The context may already be closing if the run failed while the delay
      // timer was pending — don't let that rejection mask the real error.
      await route.continue().catch(() => {})
    }
    await page.route('**/events-index.ndjson', delayRoute)
    await page.route('**/events-index.json', delayRoute)

    const response = await page.goto(url, { waitUntil: 'commit', timeout: 120_000 })
    if (!response || !response.ok()) {
      throw new Error(`Page load failed: ${url} returned ${response ? response.status() : 'no response'}`)
    }

    // Splash gone + bottom nav present = booted on the soon payload.
    await page.waitForSelector('.loading-screen', { state: 'detached', timeout: 120_000 })
    await page.waitForSelector('.a-bottom', { state: 'visible', timeout: 120_000 })
    const splashTime = await page.evaluate(() => performance.now())

    // Sync Node wall-clock to the page's performance.now() timeline so tap
    // latency can be stamped from OUTSIDE the (possibly blocked) main thread —
    // an evaluate at tap time would itself queue behind the block and
    // under-measure. Use performance.timeOrigin (a constant) rather than
    // sampling performance.now(): a "Date.now() - now()" pairing is skewed by
    // however long the evaluate queued behind main-thread work, biasing
    // tapResponse low; a constant can't be corrupted by protocol/queue latency.
    const clockOffset = await page.evaluate(() => performance.timeOrigin)
    const pageNow = () => Date.now() - clockOffset

    const navButton = (label) => page.locator('.a-bottom button', { hasText: label }).first()
    const navBox = async (label) => {
      const box = await navButton(label).boundingBox()
      if (!box) throw new Error(`Bottom-nav "${label}" button not found — selector drift?`)
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const navActive = (label) => page.waitForFunction((l) => {
      const btn = [...document.querySelectorAll('.a-bottom button')].find((b) => b.textContent.includes(l))
      return btn && btn.classList.contains('on')
    }, label, { timeout: 60_000 })
    const afterPaint = () => page.evaluate(() =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))))

    // --- tapResponse: tap Following mid-swap -------------------------------
    // Grab coordinates BEFORE the busy window (boundingBox needs the main
    // thread), then dispatch a raw click during it — like a real finger.
    const followingXY = await navBox('Following')
    await page.waitForTimeout(500)
    const tapAt = pageNow()
    await page.mouse.click(followingXY.x, followingXY.y)
    await navActive('Following')
    const tapPainted = await afterPaint()
    const tapResponse = tapPainted - tapAt

    // --- settle: wait out the swap render, then snapshot long tasks --------
    await page.waitForFunction(() =>
      performance.getEntriesByType('resource')
        .some((r) => /events-index\.(nd)?json/.test(r.name) && !/events-index-soon/.test(r.name)),
    { timeout: 120_000 })
    await page.waitForTimeout(settle)

    const snapshot = await page.evaluate(() => {
      const idx = performance.getEntriesByType('resource')
        .find((r) => /events-index\.(nd)?json/.test(r.name) && !/events-index-soon/.test(r.name))
      return { tasks: window.__longtasks || [], indexEnd: idx ? idx.responseEnd : null }
    })
    const durations = snapshot.tasks.map((t) => t.dur)
    const worstTask = durations.length ? Math.max(...durations) : 0
    const totalBlock = durations.reduce((s, d) => s + d, 0)
    const swapStart = snapshot.indexEnd ?? splashTime
    const swapDurations = snapshot.tasks.filter((t) => t.start >= swapStart).map((t) => t.dur)
    const swapBlock = swapDurations.length ? Math.max(...swapDurations) : 0

    // --- mapOpen: first Map-tab open, post-settle --------------------------
    // Route through Discover first: entering Following set the mobile map
    // scope to the (empty) personal feed; Discover resets it to 'all', so the
    // map open exercises the marker pipeline over the full corpus.
    const discoverXY = await navBox('Discover')
    await page.mouse.click(discoverXY.x, discoverXY.y)
    await navActive('Discover')
    const mapXY = await navBox('Map')
    const mapAt = pageNow()
    await page.mouse.click(mapXY.x, mapXY.y)
    await page.waitForSelector('.leaflet-container', { state: 'visible', timeout: 60_000 })
    const mapPainted = await afterPaint()
    const mapOpen = mapPainted - mapAt

    // --- mapReopen: leave the Map tab, then open it a second time ----------
    // Measures the recurring cost of returning to the Map tab with the lazy
    // chunk already cached by mapOpen. Before the Fix 2 keep-alive this was a
    // full Leaflet re-boot (init + marker pipeline); with it, a CSS re-show.
    // The `hidden` state matches both worlds (hidden = not visible OR
    // detached), so the harness stays valid across that change. The wait +
    // paint + pause make sure the measured tap starts from a quiet main
    // thread with the old map fully out of view.
    await page.mouse.click(discoverXY.x, discoverXY.y)
    await navActive('Discover')
    await page.waitForSelector('.leaflet-container', { state: 'hidden', timeout: 60_000 })
    await afterPaint()
    await page.waitForTimeout(500)
    const mapReopenAt = pageNow()
    await page.mouse.click(mapXY.x, mapXY.y)
    await page.waitForSelector('.leaflet-container', { state: 'visible', timeout: 60_000 })
    const mapReopenPainted = await afterPaint()
    const mapReopen = mapReopenPainted - mapReopenAt

    // --- youOpen: Discover → You switch, post-settle -----------------------
    // The representative "You is slow" transition: tearing down the (largest)
    // Discover view and mounting You in one synchronous commit, under the
    // shell-wide re-render every section change causes. Routed via Discover so
    // the metric owns that transition rather than a Map teardown.
    await page.mouse.click(discoverXY.x, discoverXY.y)
    await navActive('Discover')
    await page.waitForSelector('.leaflet-container', { state: 'hidden', timeout: 60_000 })
    await afterPaint()
    await page.waitForTimeout(500)
    const youXY = await navBox('You')
    const youAt = pageNow()
    await page.mouse.click(youXY.x, youXY.y)
    // Anchor on the You view's own heading, not the nav active-state: if
    // section navigation later becomes a startTransition (see
    // docs/web-tab-switch-performance.md Fix 1), the nav highlight will paint
    // before the view swap — a nav-state anchor would then collapse this
    // metric to input-feedback latency and stop tracking the swap itself.
    await page.waitForSelector('.a-h1:text-is("You")', { state: 'visible', timeout: 60_000 })
    const youPainted = await afterPaint()
    const youOpen = youPainted - youAt

    const round = (v) => Math.round(v)
    return {
      worstTask: round(worstTask),
      totalBlock: round(totalBlock),
      swapBlock: round(swapBlock),
      tapResponse: round(tapResponse),
      splashTime: round(splashTime),
      mapOpen: round(mapOpen),
      mapReopen: round(mapReopen),
      youOpen: round(youOpen),
    }
  } finally {
    await context.close()
  }
}

// The personalized pass: same boot choreography as profileOnce (throttle,
// blocked SW, delayed full corpus), but with the seed profile in localStorage
// before any app script runs. Returns { personalizedSettle, followingOpen }.
async function profilePersonalizedOnce(browser, { url, cpu, indexDelay, settle }, seedFavorites) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })

    await page.addInitScript(({ favorites, searches, geo }) => {
      try {
        localStorage.setItem('calendar-ripper-ftux-seen', '1')
        // The app's own personalization keys (App.jsx) — the anonymous
        // localStorage list runs the same saved-filter matching code a
        // signed-in list does, so no auth is needed in the lab.
        localStorage.setItem('calendar-ripper-favorites', JSON.stringify(favorites))
        localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(searches))
        localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(geo))
      } catch { /* ignore */ }
      window.__longtasks = []
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__longtasks.push({ start: e.startTime, dur: e.duration })
        }).observe({ type: 'longtask', buffered: true })
      } catch { /* longtask API missing — metrics will be 0 and obviously wrong */ }
      try { performance.setResourceTimingBufferSize(1000) } catch { /* ignore */ }
    }, { favorites: seedFavorites, searches: SEED_SEARCHES, geo: SEED_GEO })

    const delayRoute = async (route) => {
      await new Promise((r) => setTimeout(r, indexDelay))
      await route.continue().catch(() => {})
    }
    await page.route('**/events-index.ndjson', delayRoute)
    await page.route('**/events-index.json', delayRoute)

    const response = await page.goto(url, { waitUntil: 'commit', timeout: 120_000 })
    if (!response || !response.ok()) {
      throw new Error(`Page load failed: ${url} returned ${response ? response.status() : 'no response'}`)
    }
    await page.waitForSelector('.loading-screen', { state: 'detached', timeout: 120_000 })
    await page.waitForSelector('.a-bottom', { state: 'visible', timeout: 120_000 })

    // --- personalizedSettle: long-task total through the settled boot -------
    // Same window as the anonymous pass's totalBlock (full corpus landed +
    // fixed settle), with the profile seeded. When saved-search matching runs
    // on the main thread this is where its multi-second storm shows up; run
    // in the worker it should track the anonymous totalBlock.
    await page.waitForFunction(() =>
      performance.getEntriesByType('resource')
        .some((r) => /events-index\.(nd)?json/.test(r.name) && !/events-index-soon/.test(r.name)),
    { timeout: 120_000 })
    await page.waitForTimeout(settle)
    const durations = await page.evaluate(() => (window.__longtasks || []).map((t) => t.dur))
    const personalizedSettle = durations.reduce((s, d) => s + d, 0)

    // --- followingOpen: post-settle Discover → Following with a real feed ---
    const navButton = (label) => page.locator('.a-bottom button', { hasText: label }).first()
    const navBox = async (label) => {
      const box = await navButton(label).boundingBox()
      if (!box) throw new Error(`Bottom-nav "${label}" button not found — selector drift?`)
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const clockOffset = await page.evaluate(() => performance.timeOrigin)
    const pageNow = () => Date.now() - clockOffset
    const afterPaint = () => page.evaluate(() =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))))

    const followingXY = await navBox('Following')
    await afterPaint()
    await page.waitForTimeout(500)
    const followingAt = pageNow()
    await page.mouse.click(followingXY.x, followingXY.y)
    // Anchor on the view's own heading (not the nav highlight): navigation is
    // a startTransition, so the pressed state paints before the swap — the
    // heading is the "feed is on screen" signal this metric owns.
    await page.waitForSelector('.a-h1:text-is("Following")', { state: 'visible', timeout: 60_000 })
    const followingPainted = await afterPaint()
    const followingOpen = followingPainted - followingAt

    const round = (v) => Math.round(v)
    return {
      personalizedSettle: round(personalizedSettle),
      followingOpen: round(followingOpen),
    }
  } finally {
    await context.close()
  }
}

export function summarize(runs) {
  const keys = Object.keys(runs[0])
  const metrics = {}
  for (const k of keys) metrics[k] = median(runs.map((r) => r[k]))
  return metrics
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  // Resolve the seeded-favorites list once, up front — a deployment whose
  // manifest can't be read must fail the harness, not silently skip the
  // personalized metrics.
  const seedFavorites = await fetchSeedFavorites(args.url)
  const browser = await chromium.launch()
  const runs = []
  try {
    for (let i = 1; i <= args.runs; i++) {
      const anonymous = await profileOnce(browser, args)
      const personalized = await profilePersonalizedOnce(browser, args, seedFavorites)
      const run = { ...anonymous, ...personalized }
      runs.push(run)
      console.error(`run ${i}/${args.runs}: ${JSON.stringify(run)}`)
    }
  } finally {
    await browser.close()
  }

  const result = {
    metrics: summarize(runs),
    runs,
    meta: { url: args.url, cpu: args.cpu, runs: args.runs, indexDelayMs: args.indexDelay, settleMs: args.settle },
  }
  const json = JSON.stringify(result, null, 2)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(args.out, json + '\n')
  }
  console.log(json)
}

// Import-safe for unit tests (median/summarize); run only as a CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`boot-profile failed: ${err.stack || err}`)
    process.exit(1)
  })
}
