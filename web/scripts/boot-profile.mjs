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
// events-index.json and SW-originated fetches bypass route interception —
// with it active, the delay below is a race), and the full events-index.json
// response delayed so the splash always dismisses on the "soon" payload first.
// Then: tap Following mid-swap (tapResponse), let the swap settle, snapshot
// long tasks, and finally exercise post-settle tab switches: first Map open
// from Discover (mapOpen), a second Map open after leaving the tab
// (mapReopen), and a Discover → You switch (youOpen).
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
      // The swap-block wait reads the events-index.json resource entry; make
      // sure an image-heavy boot can't evict it from the default 250-entry
      // resource-timing buffer.
      try { performance.setResourceTimingBufferSize(1000) } catch { /* ignore */ }
    })

    // Delay ONLY the full index (the glob doesn't match events-index-soon.json),
    // pinning the production ordering: splash dismisses on soon, full lands later.
    await page.route('**/events-index.json', async (route) => {
      await new Promise((r) => setTimeout(r, indexDelay))
      // The context may already be closing if the run failed while the delay
      // timer was pending — don't let that rejection mask the real error.
      await route.continue().catch(() => {})
    })

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
        .some((r) => /events-index\.json/.test(r.name) && !/events-index-soon/.test(r.name)),
    { timeout: 120_000 })
    await page.waitForTimeout(settle)

    const snapshot = await page.evaluate(() => {
      const idx = performance.getEntriesByType('resource')
        .find((r) => /events-index\.json/.test(r.name) && !/events-index-soon/.test(r.name))
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
    // Leaving the tab unmounts Leaflet entirely (the content area is keyed by
    // section), so every RE-entry pays init + the full marker pipeline again.
    // With the lazy map chunk already cached by mapOpen, this isolates that
    // recurring cost from mapOpen's one-time chunk fetch. The detached wait +
    // paint + pause make sure the measured tap starts from a quiet main
    // thread with the old map fully torn down.
    await page.mouse.click(discoverXY.x, discoverXY.y)
    await navActive('Discover')
    await page.waitForSelector('.leaflet-container', { state: 'detached', timeout: 60_000 })
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
    await page.waitForSelector('.leaflet-container', { state: 'detached', timeout: 60_000 })
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

export function summarize(runs) {
  const keys = Object.keys(runs[0])
  const metrics = {}
  for (const k of keys) metrics[k] = median(runs.map((r) => r[k]))
  return metrics
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const browser = await chromium.launch()
  const runs = []
  try {
    for (let i = 1; i <= args.runs; i++) {
      const run = await profileOnce(browser, args)
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
