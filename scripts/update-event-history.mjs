// Append today's coverage counts to docs/event-history.json and copy to
// output/event-history.json for deployment. Run after generate-calendars.
//
// The series is the data behind the health dashboard's coverage chart. It has
// been lost once already: the file lives in a GitHub Actions cache, the cache
// was evicted, the restore fell through to the stale committed copy, and 67
// days vanished. So this script no longer trusts any single source. It merges,
// in increasing order of authority:
//
//   committed docs/event-history.json
//     -> each --merge <path> in the order given (restored cache, then the
//        live published copy fetched from the deployed site)
//     -> this build's own computation
//
// For any (date, field) the most authoritative source with a *defined* value
// wins; a date present in any source is kept; nothing is ever dropped. Losing
// a date now requires it to be absent from every source at once, and the
// published copy is the previous run's merged output. The shrink guard below
// fails the build rather than let the file truncate a second time.
//
// Usage:
//   node scripts/update-event-history.mjs
//   node scripts/update-event-history.mjs --merge cached.json --merge published.json --cache-out cached.json

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HISTORY_FILE = 'docs/event-history.json';
const MANIFEST_FILE = 'output/manifest.json';
const BUILD_ERRORS_FILE = 'output/build-errors.json';
const CANDIDATES_DIR = 'docs/source-candidates';

// Statuses that mean "we evaluated this source, it looks viable, and it is not
// implemented yet" — the un-worked part of the discovery pipeline. `added` and
// `proxy` are live; `notviable`/`blocked`/`dead` are not actionable.
const VIABLE_STATUSES = new Set(['candidate', 'investigating']);

// ---------------------------------------------------------------- counters

// Calendars with future events, as advertised by the manifest.
export function countCalendars(manifest) {
  if (!manifest) return undefined;
  const r = (manifest.rippers ?? []).reduce((n, x) => n + (x.calendars?.length ?? 0), 0);
  const rc = (manifest.recurringCalendars ?? []).length;
  const ec = (manifest.externalCalendars ?? []).length;
  return r + rc + ec;
}

// The maintenance backlog: everything the resolver skills still have to drain.
//
// Every term must be *measurable* for the number to mean anything. The gap
// queues were added to build-errors.json at different times (duplicateStats
// ~2026-06-17, settingGaps ~2026-07-06), and treating an absent queue as 0
// would silently redefine the metric partway through the series — a backlog
// trend that means two different things over its length is worse than a
// shorter one. So a report missing any contributing key yields undefined and
// the line simply starts later.
//
// When a NEW gap queue is added to build-errors.json, add it here too, or the
// series silently changes meaning from that build onward.
const QUEUE_TERMS = [
  (be) => be.uncertaintyStats?.outstanding,
  (be) => be.photoGaps?.venueGaps?.length,
  (be) => be.photoGaps?.eventGaps?.length,
  (be) => be.costGaps?.length,
  (be) => be.settingGaps?.venueGaps?.length,
  (be) => be.settingGaps?.eventGaps?.length,
  (be) => be.duplicateStats?.candidates,
  (be) => be.geocodeErrors?.length,
];

export function openWorkQueue(be) {
  if (!be) return undefined;
  let total = 0;
  for (const term of QUEUE_TERMS) {
    const v = term(be);
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    total += v;
  }
  return total;
}

// Count source candidates that are viable but not yet implemented.
//
// Deliberately a line scan rather than the `yaml` dependency (which is
// available): these files carry unquoted colons in `name:` values — e.g.
// "Barks, Bikes + Brews: Dog Days of Summer" — and free Markdown prose after
// the frontmatter, so a strict parser throws on real files in the tree. Only
// the frontmatter block is scanned, so a `status:`-lookalike line in the body
// cannot match.
export function countViableCandidates(dir = CANDIDATES_DIR) {
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return undefined; // directory moved or absent — a gap, not a crash to zero
  }
  let parsed = 0;
  let viable = 0;
  for (const file of files) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    let text;
    try {
      text = readFileSync(path.join(dir, file), 'utf-8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    if (lines[0]?.trim() !== '---') continue;
    // Trim the closing fence too. An exact indexOf('---') misses a fence with
    // trailing whitespace — which YAML and every Markdown renderer accept — and
    // the file would vanish from the count with no error anywhere.
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end === -1) continue;
    const match = /^status:\s*([a-z-]+)/m.exec(lines.slice(1, end).join('\n'));
    if (!match) continue;
    parsed++;
    if (VIABLE_STATUSES.has(match[1])) viable++;
  }
  return parsed === 0 ? undefined : viable;
}

// ------------------------------------------------------------------ merge

// Drop undefined/null so a source that doesn't know a field can never erase
// one that does.
export function definedFields(point) {
  return Object.fromEntries(Object.entries(point).filter(([, v]) => v !== undefined && v !== null));
}

// Union `incoming` onto `base` per date, field by field. `incoming` is the more
// authoritative side. Result is sorted by date.
export function mergeHistory(base, incoming) {
  const byDate = new Map();
  for (const p of base ?? []) {
    if (p?.date) byDate.set(p.date, { ...definedFields(p) });
  }
  for (const p of incoming ?? []) {
    if (!p?.date) continue;
    byDate.set(p.date, { ...(byDate.get(p.date) ?? {}), ...definedFields(p) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Upsert one point, merging rather than replacing. The same day is written by
// both push builds and the nightly schedule; a replace would drop whatever
// fields the current run happened not to compute.
export function upsertPoint(history, point) {
  return mergeHistory(history, [point]);
}

// ------------------------------------------------------------------- main

// `null` means "not there", which callers treat as a layer to skip. A file
// that EXISTS but does not parse is a different thing entirely and must throw:
// swallowing it would hand the merge an empty base, which also zeroes the
// shrink guard's baseline — so a corrupt committed file would be silently
// replaced by a one-point series and written back to every destination.
function readJsonArray(file, { required = false } = {}) {
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (err) {
    if (required) throw new Error(`${file} exists but is not valid JSON: ${err.message}`);
    return null;
  }
  if (Array.isArray(parsed)) return parsed;
  if (required) throw new Error(`${file} is not a JSON array`);
  return null;
}

function readJsonObject(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const merges = [];
  let cacheOut = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--merge' && argv[i + 1]) merges.push(argv[++i]);
    else if (argv[i] === '--cache-out' && argv[i + 1]) cacheOut = argv[++i];
  }
  return { merges, cacheOut };
}

export function main(argv) {
  const { merges, cacheOut } = parseArgs(argv);

  const manifest = readJsonObject(MANIFEST_FILE);
  const buildErrors = readJsonObject(BUILD_ERRORS_FILE);
  const calendars = countCalendars(manifest);
  const events = buildErrors?.geoStats?.totalEvents;

  // A build with no output still has to merge and republish. event-history.json
  // is a required data file (check-missing-urls), and skipping the write would
  // both fail that check and drop the file from the deployed site — knocking
  // out the published layer that the next build merges from. So only today's
  // POINT is skipped here, never the merge.
  const haveOutput = Boolean(events || calendars);
  if (!haveOutput) {
    console.log('No build output found — merging and republishing without a new point');
  }

  const point = haveOutput
    ? definedFields({
        date: new Date().toISOString().slice(0, 10),
        events,
        calendars,
        candidates: countViableCandidates(),
        queue: openWorkQueue(buildErrors),
        errors: buildErrors?.totalErrors,
      })
    : null;

  // Merge in increasing authority, tracking the biggest input so the shrink
  // guard can tell truncation from a genuinely small series.
  let history = readJsonArray(HISTORY_FILE, { required: true }) ?? [];
  let largestInput = history.length;
  for (const file of merges) {
    const incoming = readJsonArray(file);
    if (!incoming) {
      console.log(`Merge source unavailable, skipping: ${file}`);
      continue;
    }
    console.log(`Merging ${incoming.length} points from ${file}`);
    largestInput = Math.max(largestInput, incoming.length);
    history = mergeHistory(history, incoming);
  }
  if (point) history = upsertPoint(history, point);

  if (history.length < largestInput) {
    console.error(
      `::error::Event history shrank: merged ${history.length} points but an input had ${largestInput}. ` +
        'Refusing to write a truncated series.'
    );
    return 1;
  }

  const json = JSON.stringify(history, null, 2) + '\n';
  writeFileSync(HISTORY_FILE, json);
  if (existsSync('output')) writeFileSync('output/event-history.json', json);
  if (cacheOut) writeFileSync(cacheOut, json);

  if (point) {
    const shown = Object.entries(point)
      .filter(([k]) => k !== 'date')
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    console.log(`Event history: ${point.date} ${shown} (${history.length} total points)`);
  } else {
    console.log(`Event history: no new point (${history.length} total points)`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
