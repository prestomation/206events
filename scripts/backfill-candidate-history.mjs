// One-shot: reconstruct the `candidates` series from git history.
//
// Cloudflare PR previews carry no candidate counts — docs/source-candidates/
// is repo content, not build output — so the only exact record of how the
// un-implemented source backlog moved is the commit history itself. For each
// date already in docs/event-history.json this walks back to the last
// first-parent commit on main at or before that day and counts the candidate
// files that were `candidate` or `investigating` at that moment.
//
// Run locally, never from a workflow:
//   node scripts/backfill-candidate-history.mjs [--dry-run] [--ref origin/main]
//
// Exact by construction, unlike reconstructing from `firstSeen`/`pr`
// frontmatter: those date when a file appeared, not when its status flipped.
// Only 182 of 321 `added` files carry a `pr` at all and no `notviable` file
// carries a flip date, so that route would systematically understate the past.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { mergeHistory } from './update-event-history.mjs';

const HISTORY_FILE = 'docs/event-history.json';
const DIR = 'docs/source-candidates';

// Statuses meaning "viable, evaluated, not implemented yet". Kept in step with
// VIABLE_STATUSES in update-event-history.mjs.
const VIABLE = 'candidate|investigating';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const refIdx = args.indexOf('--ref');
const REF = refIdx >= 0 ? args[refIdx + 1] : 'origin/main';

function git(...a) {
  return execFileSync('git', a, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

// Same, but with stderr discarded: the probes below use a non-zero exit as a
// signal ("no such path", "no matches"), and git narrates those to stderr.
function gitQuiet(...a) {
  return execFileSync('git', a, {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// A shallow clone silently yields "no commit before this date" for every date
// past its boundary, which would write a flat, wrong series. Refuse instead.
if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
  // Not `git log -1 --reverse`: -1 truncates to the newest commit *before*
  // --reverse is applied, so that reports HEAD's date, not the boundary.
  const dates = git('log', '--format=%cs', REF).trim().split('\n');
  const oldest = dates[dates.length - 1];
  const history = existsSync(HISTORY_FILE) ? JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) : [];
  const need = history[0]?.date ?? '2026-04-01';
  if (!oldest || oldest > need) {
    console.error(
      `This clone is shallow: the oldest commit on ${REF} is ${oldest || 'unknown'}, but the ` +
        `series starts ${need}. Deepen it first, then re-run:\n\n` +
        `  git fetch --shallow-since=${need} origin main\n\n` +
        'Do not use --unshallow: this repo commits ~20MB of e2e screenshots and map tiles.'
    );
    process.exit(1);
  }
}

const history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));

// Last first-parent commit at or before end-of-day. --first-parent matters:
// without it you can land on a PR-branch commit whose candidate set is
// mid-edit, rather than on the state main actually had.
function commitAt(date) {
  const sha = git('rev-list', '-1', '--first-parent', `--before=${date}T23:59:59Z`, REF).trim();
  return sha || null;
}

function countAt(sha) {
  // The directory postdates the start of the series; before it existed,
  // statuses lived as emoji in a single docs/source-candidates.md. Emit no
  // field for those dates rather than a fabricated 0.
  try {
    gitQuiet('cat-file', '-e', `${sha}:${DIR}`);
  } catch {
    return undefined;
  }
  let out;
  try {
    out = gitQuiet(
      'grep', '-h', '-E', `^status: *(${VIABLE})`, sha, '--',
      `${DIR}/*.md`,
      // README.md documents the schema with a literal `status: candidate`
      // example line, which would otherwise count as a real candidate.
      `:!${DIR}/README.md`
    );
  } catch {
    return 0; // git grep exits 1 on no matches
  }
  return out.split('\n').filter(Boolean).length;
}

const shaCache = new Map();
const countCache = new Map();
const points = [];
let resolved = 0;
let skipped = 0;

for (const p of history) {
  let sha = shaCache.get(p.date);
  if (sha === undefined) {
    sha = commitAt(p.date);
    shaCache.set(p.date, sha);
  }
  if (!sha) { skipped++; continue; }

  let count = countCache.get(sha);
  if (count === undefined) {
    count = countAt(sha);
    countCache.set(sha, count);
  }
  if (count === undefined) { skipped++; continue; }

  resolved++;
  points.push({ date: p.date, candidates: count });
  process.stdout.write(`\r  ${resolved} dates resolved...`);
}
process.stdout.write('\n');

// Git is authoritative for this field — nothing else records it — so the
// computed points win over whatever is on file.
const merged = mergeHistory(history, points);

if (merged.length !== history.length) {
  console.error(`::error::Point count changed ${history.length} -> ${merged.length}. Refusing to write.`);
  process.exit(1);
}

const withField = merged.filter((p) => 'candidates' in p);
console.log(`Resolved ${resolved} dates (${countCache.size} distinct commits), skipped ${skipped}`);
console.log(
  `candidates present on ${withField.length}/${merged.length} points` +
    (withField.length ? `, ${withField[0].date} -> ${withField[withField.length - 1].date}` : '')
);
if (withField.length) {
  console.log(`range: ${Math.min(...withField.map((p) => p.candidates))} -> ${withField[withField.length - 1].candidates}`);
}

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
} else {
  writeFileSync(HISTORY_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nWrote ${merged.length} points to ${HISTORY_FILE}`);
}
