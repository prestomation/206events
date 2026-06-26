// Append today's event/calendar counts to docs/event-history.json and copy
// to output/event-history.json for deployment.  Run after generate-calendars.
import { readFileSync, writeFileSync, existsSync } from 'fs';

const HISTORY_FILE = 'docs/event-history.json';
const MANIFEST_FILE = 'output/manifest.json';
const BUILD_ERRORS_FILE = 'output/build-errors.json';

let calendars = 0;
if (existsSync(MANIFEST_FILE)) {
  const m = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
  const r = (m.rippers ?? []).reduce((n, x) => n + (x.calendars?.length ?? 0), 0);
  const rc = (m.recurringCalendars ?? []).length;
  const ec = (m.externalCalendars ?? []).length;
  calendars = r + rc + ec;
}

let events = 0;
if (existsSync(BUILD_ERRORS_FILE)) {
  const d = JSON.parse(readFileSync(BUILD_ERRORS_FILE, 'utf-8'));
  events = d.geoStats?.totalEvents ?? 0;
}

if (events === 0 && calendars === 0) {
  console.log('No build output found — skipping history update');
  process.exit(0);
}

const date = new Date().toISOString().slice(0, 10);
const history = existsSync(HISTORY_FILE)
  ? JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
  : [];

const idx = history.findIndex(p => p.date === date);
const point = { date, events, calendars };
if (idx >= 0) history[idx] = point; else history.push(point);
history.sort((a, b) => a.date.localeCompare(b.date));

writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2) + '\n');
if (existsSync('output')) {
  writeFileSync('output/event-history.json', JSON.stringify(history, null, 2) + '\n');
}
console.log(`Event history: ${events} events, ${calendars} calendars on ${date} (${history.length} total points)`);
