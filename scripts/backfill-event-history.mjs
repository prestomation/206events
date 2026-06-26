// One-time backfill: sweep every Cloudflare Pages PR preview and harvest
// build-errors.json + manifest.json to reconstruct the event/calendar history.
// Run with: node scripts/backfill-event-history.mjs
//
// Writes (or merges into) docs/event-history.json, keeping one data point per
// day (the entry with the latest buildTime for that day wins).

import { readFileSync, writeFileSync, existsSync } from 'fs';

const HISTORY_FILE = 'docs/event-history.json';
const BASE_URL = 'https://pr-{n}.206events.pages.dev';
const CONCURRENCY = 30;
const TIMEOUT_MS = 8000;

// Range to sweep — update MAX_PR to the highest open/merged PR number.
const MIN_PR = 1;
const MAX_PR = parseInt(process.argv[2] ?? '731', 10);

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function countCalendars(manifest) {
  if (!manifest) return 0;
  const r = (manifest.rippers ?? []).reduce((n, x) => n + (x.calendars?.length ?? 0), 0);
  const rc = (manifest.recurringCalendars ?? []).length;
  const ec = (manifest.externalCalendars ?? []).length;
  return r + rc + ec;
}

async function tryPr(n) {
  const base = BASE_URL.replace('{n}', n);
  const errors = await fetchJson(`${base}/build-errors.json`);
  if (!errors?.buildTime) return null;

  const manifest = await fetchJson(`${base}/manifest.json`);
  const events = errors.geoStats?.totalEvents ?? 0;
  const calendars = countCalendars(manifest);
  const date = errors.buildTime.slice(0, 10);

  return { date, events, calendars, buildTime: errors.buildTime, pr: n };
}

// Run N promises concurrently.
async function pool(items, fn, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// Load existing history so we can merge.
let existing = [];
if (existsSync(HISTORY_FILE)) {
  existing = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
}
const existingByDate = Object.fromEntries(existing.map(p => [p.date, p]));

const prs = Array.from({ length: MAX_PR - MIN_PR + 1 }, (_, i) => i + MIN_PR);

console.log(`Sweeping PR #${MIN_PR}–#${MAX_PR} (${prs.length} PRs, concurrency=${CONCURRENCY})…`);

let done = 0;
const tick = setInterval(() => {
  process.stdout.write(`\r  ${done}/${prs.length} checked…`);
}, 500);

const raw = await pool(prs, async (n) => {
  const r = await tryPr(n);
  done++;
  return r;
}, CONCURRENCY);

clearInterval(tick);
process.stdout.write('\n');

// Group by date; latest buildTime per day wins.
const byDate = { ...existingByDate };
for (const point of raw) {
  if (!point) continue;
  const prev = byDate[point.date];
  if (!prev || point.buildTime > prev.buildTime) {
    byDate[point.date] = { date: point.date, events: point.events, calendars: point.calendars };
  }
}

const history = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2) + '\n');
console.log(`Done. ${history.length} daily data points written to ${HISTORY_FILE}`);
console.log('Date range:', history[0]?.date, '→', history[history.length - 1]?.date);
