// Reconstruct the coverage history by sweeping Cloudflare Pages PR previews.
//
// Every PR preview deploys the full build output, so `build-errors.json` +
// `manifest.json` under https://pr-<n>.206events.pages.dev are a per-build
// archive going back further than anything else we have. This is how the
// series was originally seeded, and how the 2026-06-26 -> 08-31 hole (an
// evicted Actions cache) gets filled.
//
// Run with: node scripts/backfill-event-history.mjs [MAX_PR] [MIN_PR]
//           node scripts/backfill-event-history.mjs 1400 --dry-run
//           node scripts/backfill-event-history.mjs --preview-host 'https://pr-{n}.example.pages.dev'
//
// PROVENANCE CAVEAT: preview points are builds of *unmerged branches*. A PR
// adding twelve sources shows inflated `calendars`; a PR mid-way through
// fixing a ripper shows inflated `errors`. Two things keep that honest:
// committed values always win over harvested ones (so main-build data is never
// overwritten), and within a day the latest `buildTime` wins (usually the last
// merge of the day). For the June-August hole there is no main-build data at
// all, so preview data is all there is — better than a two-month blank.
//
// Writes (or merges into) docs/event-history.json, one point per day.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { openWorkQueue, definedFields, mergeHistory, countCalendars } from './update-event-history.mjs';

const HISTORY_FILE = 'docs/event-history.json';

// Cloudflare's per-PR preview host, derived from the site's own domain rather
// than hardcoded: this repo is a city template, and a fork sweeping
// 206events.pages.dev would merge Seattle's series into its own. Override with
// --preview-host <pattern> where {n} is the PR number.
function defaultPreviewHost() {
  const url = execFileSync('npx', ['tsx', 'scripts/print-city-config.ts', 'site.productionUrl'], {
    encoding: 'utf-8',
  }).trim();
  // https://206.events -> 206events (Cloudflare Pages project slug)
  const project = new URL(url).hostname.replace(/^www\./, '').replace(/\./g, '');
  return `https://pr-{n}.${project}.pages.dev`;
}
const CONCURRENCY = 30;
const TIMEOUT_MS = 8000;

// Strict parsing, matching update-event-history.mjs: silently ignoring an
// unknown flag means `--dryrun` overwrites the committed data file the operator
// meant only to inspect, and `--preview-host=...` sweeps the wrong Cloudflare
// project — merging another city's series into this one.
const args = process.argv.slice(2);
const positional = [];
let dryRun = false;
let hostArg = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg === '--preview-host') {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      console.error('--preview-host requires a URL pattern, e.g. https://pr-{n}.example.pages.dev');
      process.exit(1);
    }
    hostArg = value;
    i++;
  } else if (arg.startsWith('--')) {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  } else {
    positional.push(arg);
  }
}
const MAX_PR = parseInt(positional[0] ?? '1400', 10);
const MIN_PR = parseInt(positional[1] ?? '1', 10);
// Without this, `backfill-event-history.mjs latest` yields NaN bounds, an empty
// PR list, and a run that rewrites the data file unchanged and exits 0 — a
// no-op reported as success, which the shrink guard cannot catch either.
if (!Number.isInteger(MAX_PR) || !Number.isInteger(MIN_PR) || MIN_PR < 1 || MAX_PR < MIN_PR) {
  console.error(`Invalid PR range: MIN_PR=${positional[1] ?? 1} MAX_PR=${positional[0] ?? 1400}`);
  process.exit(1);
}
const BASE_URL = hostArg ?? defaultPreviewHost();

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

async function tryPr(n) {
  const base = BASE_URL.replace('{n}', n);
  const errors = await fetchJson(`${base}/build-errors.json`);
  if (!errors?.buildTime) return null;

  const manifest = await fetchJson(`${base}/manifest.json`);
  const events = errors.geoStats?.totalEvents;
  const calendars = countCalendars(manifest);
  // `!== undefined`, matching update-event-history.mjs: a build where every
  // source failed genuinely measured 0 events, and since these previews are the
  // only record of the recovered window, dropping such a day would erase the
  // outage entirely and draw a straight line across it.
  if (events === undefined && calendars === undefined) return null;

  return {
    // buildTime is kept on the working record for the per-day tie-break and
    // stripped before serializing. The previous version dropped it here, so
    // `point.buildTime > prev.buildTime` was always false and the *first* PR
    // seen for a date won rather than the last.
    buildTime: errors.buildTime,
    pr: n,
    point: definedFields({
      date: errors.buildTime.slice(0, 10),
      events,
      calendars,
      queue: openWorkQueue(errors),
      errors: errors.totalErrors,
    }),
  };
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

let existing = [];
if (existsSync(HISTORY_FILE)) {
  existing = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
  if (!Array.isArray(existing)) {
    console.error(`${HISTORY_FILE} is not a JSON array`);
    process.exit(1);
  }
}
const distinctDates = (points) => new Set(points.map((p) => p?.date).filter(Boolean)).size;
const prs = Array.from({ length: MAX_PR - MIN_PR + 1 }, (_, i) => i + MIN_PR);

console.log(`Sweeping PR #${MIN_PR}-#${MAX_PR} at ${BASE_URL} (${prs.length} PRs, concurrency=${CONCURRENCY})...`);

let done = 0;
const tick = setInterval(() => process.stdout.write(`\r  ${done}/${prs.length} checked...`), 500);

const raw = await pool(
  prs,
  async (n) => {
    const r = await tryPr(n);
    done++;
    return r;
  },
  CONCURRENCY
);

clearInterval(tick);
process.stdout.write('\n');

// One harvested point per day: the latest buildTime wins, which biases toward
// the last (usually merged) build of that day.
const bestByDate = new Map();
let hits = 0;
for (const r of raw) {
  if (!r) continue;
  hits++;
  const prev = bestByDate.get(r.point.date);
  if (!prev || r.buildTime > prev.buildTime) bestByDate.set(r.point.date, r);
}
const harvested = [...bestByDate.values()]
  .sort((a, b) => a.point.date.localeCompare(b.point.date))
  .map((r) => r.point);

// Harvested is the BASE and the committed file is the override: a main-build
// number already on record always beats a PR-preview one, and harvesting only
// fills in dates and fields we do not already have.
const merged = mergeHistory(harvested, existing);

const existingDates = new Set(existing.map((p) => p.date));
const addedDates = merged.filter((p) => !existingDates.has(p.date)).length;
const existingByDate = new Map(existing.map((p) => [p.date, p]));
const fieldsAdded = merged.reduce((n, p) => {
  const before = existingByDate.get(p.date);
  if (!before) return n;
  return n + Object.keys(p).filter((k) => !(k in before)).length;
}, 0);

console.log(`Previews with build output: ${hits} across ${bestByDate.size} distinct days`);
console.log(`Points: ${existing.length} -> ${merged.length} (+${addedDates} new days)`);
console.log(`Fields added to existing days: ${fieldsAdded}`);
console.log('Date range:', merged[0]?.date, '->', merged[merged.length - 1]?.date);

// Distinct DATES, not raw entries: mergeHistory keys by date, so one duplicated
// entry in the committed file would otherwise abort a perfectly good backfill.
if (merged.length < distinctDates(existing)) {
  console.error('::error::Merged series covers fewer dates than the committed one. Refusing to write.');
  process.exit(1);
}

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
} else {
  writeFileSync(HISTORY_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nWrote ${merged.length} points to ${HISTORY_FILE}`);
}
