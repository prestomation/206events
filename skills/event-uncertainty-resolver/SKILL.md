# 206.events Event Uncertainty Resolver

Resolve outstanding `UncertaintyError` entries in the
`event-uncertainty-cache.json` by investigating the upstream source page
and writing the correct field values back into the cache.

This is the time-and-fields analog of the `geo-resolver` skill. When a
ripper can't determine a field (a start time, a duration, a location, an
image), it emits the event anyway with a placeholder value plus an
`UncertaintyError` carrying the partial event. The cache stores
resolutions; on the next build the infrastructure layer (`lib/
uncertainty-merge.ts`) applies them and the error disappears.

## Workflow

### 0. Sweep this queue's prior open PRs (mandatory)

**Before reading the queue**, close out the open PRs left by earlier uncertainty
drains. The full rule is *Step 0* under "Queue Draining — Work Until Empty" in
`AGENTS.md`; the short version:

List open PRs whose branch or title marks them as a drain of this queue
(`*-uncertainty*`, "Resolve … uncertainty"), plus any multi-queue "Queue drain" PR — those
usually touch this cache too. For each, run the supersession check:

```sh
python3 scripts/drain-pr-sweep.py <pr-merge-base-sha> <pr-head-ref>
```

- **`SUPERSEDED`** → close the PR, with a comment naming what superseded it.
  Nothing is lost — the queue re-surfaces anything still outstanding.
- **`HAS-NOVEL-WORK`** → close it too (a stale drain branch conflicts in the
  cache and can't be rebased), but first read the keys it lists, along with
  their resolutions and evidence, and carry them into **this** run's batch.
  That investigation is the valuable part; re-deriving it wastes the run.
  Two labels are *not* to be carried blindly: a `!=main` suffix means `main`
  holds a different — often newer — value for that field, and
  `<unresolvable-but-main-resolved>` means `main` has since answered what the
  PR gave up on. Check those before overwriting anything.
- **`NOT-APPLICABLE`** → the PR changes no cache the script reads, so nothing
  was examined and nothing is shown to be superseded. **Don't close on this
  verdict** — sweep it by `grep` against `main` instead. This is a normal shape
  here, not an edge case: a venue-photo or uniform-`cost:` PR edits source YAML
  only.
- **Opened by an in-flight run** (green CI, under a day old) → leave it, and
  exclude its keys from your batch so the two runs don't collide.

Also check by `grep` whether any non-cache change riding along in a stale PR (a
ripper fix, a source-YAML edit) landed on `main`; if it didn't and it's still
worth having, port it fresh onto `main` rather than reviving the branch.

Skipping this step is how the same events get re-investigated run after run
while the earlier PR sits open and unmergeable.

### 1. Check live stats

```bash
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py stats
```

Prints outstanding / resolved / unresolvable counts and the work-queue
size from `https://206.events/build-errors.json`.

### 2. List the work queue

```bash
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py outstanding
```

Prints each outstanding entry with its `source:eventId` key, the event
title, the date, the missing fields, and the source URL. This is what
the agent iterates over.

### 3. Investigate each entry

For each outstanding entry:

1. `WebFetch` the `event.url` — that's the source page the ripper read.
2. Find the missing field(s) on the page. Concrete values found on the
   page → confident resolution. Values mentioned only ambiguously
   ("evenings", "around 7-ish") → mark **unresolvable** with a brief
   reason rather than guessing.
3. If the page is gone (404 / redirect / different event) → mark
   unresolvable; the ripper's placeholder remains and the warning note
   on the event explains the situation to subscribers.

### 4. Write the resolution into the cache

```bash
# Resolved — pass values for whatever fields were unknown
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
  --key 'events12:family-christmas-event-2025-12-01' \
  --start-time '16:00' \
  --duration 10800 \
  --evidence 'https://events12.com/seattle/event/118800/'

# Unresolvable
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
  --key 'events12:some-event-2026-03-01' \
  --unresolvable \
  --reason 'Source page no longer lists this event'
```

The script edits the committed `event-uncertainty-cache.json` in place.
Resolving a key that already has an entry **merges** the new fields into
the existing ones (a key routinely accrues resolutions for different
fields across separate runs — e.g. `startTime` resolved on one pass,
`setting` on a later pass — so this never needs `--force`). `--force` is
only required to overwrite a field that already has a *different* cached
value, or to replace an `unresolvable` entry. **Commit the file and open
a PR** — CI reads the committed cache directly (there is no S3). See
`docs/github-native-caches.md`.

Fingerprints carried by the `UncertaintyError` (the
`partialFingerprint` field) are automatically copied into the new cache
entry so it gets invalidated when the source data changes (e.g., when
upstream finally posts a real time).

### 5. Prune stale cache entries

Run after every resolve pass so the cache stays the size of the actual
work queue, not the historical work queue.

```bash
# Always start with --dry-run and review the breakdown.
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py prune \
  --orphan-prefixes \
  --date-in-key-older-than 7 \
  --dry-run

# Apply (writes the committed file — commit it in the same PR).
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py prune \
  --orphan-prefixes \
  --date-in-key-older-than 7
```

**Don't rely on `--lastseen-older-than`**: in the GitHub-native model the
build's `lastSeen` stamps live only in the runner's working copy and are
discarded when it's reclaimed (only PR-committed changes persist), so the
stamps never accumulate across builds. `--orphan-prefixes` (safe on every
run — it only drops entries whose source no longer exists) and
`--date-in-key-older-than` read the committed cache and the source list
directly, but **`--date-in-key-older-than` is not safe for sources that
keep emitting past-dated events.** It assumes a stale date in the key
means the event is gone, but a source with a static page of annual events
(e.g. `u-district-partnership`, whose page lists Boba Fest, Chow Down, and
the Street Fair year-round) re-emits the same event — and its
`UncertaintyError` — long after the date passes. Pruning its resolution
puts the entry straight back on the outstanding queue on the next build.
Use it, but **after any prune, re-check the outstanding queue and restore
anything that reappears** before committing.

See the [flag reference](#prune-flag-reference) below for details.

### 6. Re-trigger the build

```bash
# (Requires the gh CLI when available; otherwise skip — the daily build
# will pick the resolution up automatically.)
gh workflow run "Generate Calendars and Publish to GitHub Pages" --ref main
```

After the build runs, fetch `https://206.events/build-errors.json` and
verify the resolved entries no longer appear in `uncertainEvents`.

### 7. Report results

In your reply, include:
- Number resolved vs. marked unresolvable
- Number of entries pruned (broken down by reason)
- Remaining outstanding count
- A few examples of fixed events (title, date, resolved field)

## Field reference

| Field | Value shape | Example |
|---|---|---|
| `startTime` | `HH:MM` or `HH:MM:SS` (in the event's local timezone) | `19:30` |
| `duration` | integer seconds | `10800` (3 hours) |
| `location` | string (the venue address as you would expect to see in a calendar app) | `123 Main St, Seattle, WA` |
| `imageUrl` | URL string | `https://example.com/event.jpg` |
| `cost` | `--cost-free`, `--cost-min <n>` (USD face value, optional `--cost-max <n>`), `--cost-paid-unknown`, or `--cost-sold-out` | `--cost-min 15 --cost-max 45` |

For `cost`, apply the pricing rubric in `skills/cost-resolver/SKILL.md`
(min = cheapest general-admission adult price, fees excluded; prefer
`--cost-paid-unknown` over guessing when pricing is volatile).

Use only the fields actually listed in the entry's `unknownFields`. The
resolver script enforces this — passing `--start-time` for an entry
whose `unknownFields` doesn't include `startTime` is a no-op with a
warning.

## ⚠️ Always verify against the source page

The same rule as the geo-resolver: don't trust other LLMs' guesses about
event times. The cache entries are committed effectively forever (until
the source data fingerprint changes), so a bad entry sticks around
displaying the wrong time on every build. Always cite the source page
as `--evidence`, and prefer marking unresolvable over guessing.

## Prune flag reference

The `prune` subcommand has three independent, additive flags. Pass any
combination; running with no flags prints help and exits.

- `--orphan-prefixes` — drops entries whose `source:` prefix doesn't
  match any current `name:` field under `sources/*/ripper.yaml` or
  `sources/external/*.yaml`. Run from the repo root (or pass
  `--repo-root PATH`). Catches entries left behind by source renames.
- `--date-in-key-older-than DAYS` — drops entries whose key embeds a
  parseable date (`YYYY-MM-DD`, `YYYY/MM/DD`, `YYYYMMDD`) older than
  today − DAYS. Cheap; covers the common `events12:slug-2026-05-19`
  shape. Skips opaque-ID keys like `climate-pledge-arena:tm-…`. **Not
  safe for a source whose page re-lists past-dated events** (see the
  `u-district-partnership` case above) — re-check the outstanding queue
  after pruning and restore anything that reappears.
- `--lastseen-older-than DAYS` — drops entries whose `lastSeen` (or
  `resolvedAt` fallback) is older than today − DAYS. **Effectively
  unusable in the GitHub-native model:** the build's `lastSeen` stamps
  live only in the runner's working copy and are discarded when it's
  reclaimed, so they never accumulate across builds. Without persisted
  stamps every entry falls back to `resolvedAt`, so this flag would
  over-prune. Use `--orphan-prefixes` and `--date-in-key-older-than`
  instead.

`--dry-run` prints the deletion list grouped by reason without writing;
always use it before the real run.

## ⚠️ Never read event-uncertainty-cache.json directly into context

The cache will grow with every resolution. Use the script's `stats`,
`outstanding`, `resolve`, and `prune` subcommands; never `cat` the
whole file.

## ⚠️ Two ways to silently break a resolution

Both of these were hit for real; neither surfaces as an error, so the only
symptom is an entry that stays in the queue forever.

### Never copy a `partialFingerprint` across a change to the ripper that computes it

The fingerprint exists to invalidate a resolution when the ripper's parsed
content changes: `lookupUncertaintyCache` treats a mismatch as a **miss**. So a
fingerprint carried over from a different code path can never match, and
permanently voids the resolution it is attached to — a wrong fingerprint is
strictly worse than none, because none means "always apply" while wrong means
"never apply".

This bites when porting a resolution out of a stale PR: the recorded value was
computed by that branch's formula. Either let the ripper stamp a fresh one on
the next build, or omit `--fingerprint` entirely. Only reuse one when the
hashed inputs are provably unchanged.

*Seen in #1403 → fixed in #1407: a resolution ported from a branch that hashed
`attendance|tickets|description` into a ripper that hashes
`tickets|ticket_label|description`. The price never applied, and the event kept
reporting `missing: cost` with a perfectly good resolution sitting in the cache.*

### Never run a verification build with the cache file staged

`generate-calendars` rewrites `event-uncertainty-cache.json` as it runs: it
stamps `lastSeen` on every entry it consults, and re-serializes the file through
JS `JSON.stringify`, which renormalizes `45.0` to `45` throughout. Those writes
are **ephemeral by design** (`docs/github-native-caches.md`) — only PR-committed
changes persist.

Commit them by accident and a two-line fix lands as a hundred-plus-line diff in
a 9,000-entry file that the next drain run also rewrites, which is exactly what
makes these PRs conflict and rot. Build, read the result, then restore the file
before committing:

```sh
cp event-uncertainty-cache.json /tmp/intended.json
ONLY_SOURCE=<source> npm run generate-calendars   # read output/build-errors.json
cp /tmp/intended.json event-uncertainty-cache.json
git diff --stat   # should show only what you meant to change
```

Prefer a surgical raw-text edit over a JSON round-trip for the same reason: a
`json.load` / `json.dump` cycle can renormalize numbers across the whole file
even when you only touched one entry.

## How this fits with build-report

The daily `build-report` skill is the entry point. If
`uncertaintyStats.outstanding > 0` in the health output, it hands off
to this skill. Out-of-band invocation (e.g. user types
`/event-uncertainty-resolver`) is also supported.

## Key references

- **Cache file (source of truth):** committed `event-uncertainty-cache.json` at the repo root
- **Live build errors:** `https://206.events/build-errors.json`
- **Design docs:** `docs/event-uncertainty.md`, `docs/github-native-caches.md`
- **Cache module:** `lib/event-uncertainty-cache.ts`
- **Merge function:** `lib/uncertainty-merge.ts`
