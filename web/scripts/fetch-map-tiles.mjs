// Backfill the committed map-tile fixtures in e2e/tiles/ from the paths the
// e2e suite recorded as missing.
//
// Workflow: run the e2e suite (the tile mock in e2e/mock-routes.js appends
// every uncovered z/x/y to test-results/missing-tiles.log), then run
//
//   node scripts/fetch-map-tiles.mjs
//
// and re-run the suite so the screenshots regenerate over real imagery.
// Fixtures only need refetching when a spec's viewport, the fixture event
// coordinates, or the map's fit logic changes — a pale-green tile in a
// committed screenshot is the tell (see the fallback in mock-routes.js).
//
// Tiles are fetched sequentially with a delay and a descriptive User-Agent,
// per the OSM tile usage policy (this fetches a few dozen tiles, once).
// © OpenStreetMap contributors — see e2e/tiles/README.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const LOG = join(here, '..', 'test-results', 'missing-tiles.log')
const TILES_DIR = join(here, '..', 'e2e', 'tiles')
const DELAY_MS = 250

if (!existsSync(LOG)) {
  console.error(`No ${LOG} — run the e2e suite first so the tile mock records what it's missing.`)
  process.exit(1)
}

const paths = [...new Set(readFileSync(LOG, 'utf8').split('\n').filter(Boolean))]
if (!paths.length) {
  console.log('missing-tiles.log is empty — fixtures already cover every requested tile.')
  process.exit(0)
}

mkdirSync(TILES_DIR, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let fetched = 0
for (const p of paths) {
  const [z, x, y] = p.split('/')
  const file = join(TILES_DIR, `${z}-${x}-${y}.png`)
  if (existsSync(file)) continue
  const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  const res = await fetch(url, { headers: { 'User-Agent': '206events-e2e-fixture-fetch (github.com/prestomation/206events)' } })
  if (!res.ok) {
    console.error(`FAILED ${url}: HTTP ${res.status}`)
    process.exitCode = 1
    continue
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  fetched++
  console.log(`fetched ${z}/${x}/${y}`)
  await sleep(DELAY_MS)
}
console.log(`done: ${fetched} tile(s) fetched into ${TILES_DIR}`)
