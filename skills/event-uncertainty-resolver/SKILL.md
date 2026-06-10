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

The script downloads the cache from S3, applies the entry, and uploads
it back. Refuses to overwrite an existing entry without `--force`.

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

# Apply (uploads to S3).
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py prune \
  --orphan-prefixes \
  --date-in-key-older-than 7
```

The two flags above are safe on every run. **Hold off on
`--lastseen-older-than`** until the build-time `lastSeen` stamp has had
time to populate across multiple build cycles — adding it on day one
would nuke entries that simply haven't been touched yet. From roughly
30 days after the lastSeen feature lands, add `--lastseen-older-than 30`
to the same invocation; it sweeps the opaque-ID tail (Ticketmaster
etc.) that the date-in-key heuristic can't see.

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
| `cost` | `--cost-free`, `--cost-min <n>` (USD face value, optional `--cost-max <n>`), or `--cost-paid-unknown` | `--cost-min 15 --cost-max 45` |

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
  shape. Skips opaque-ID keys like `climate-pledge-arena:tm-…`.
- `--lastseen-older-than DAYS` — drops entries whose `lastSeen` (or
  `resolvedAt` fallback) is older than today − DAYS. Covers
  opaque-ID keys too: every build stamps `lastSeen` on entries it
  consulted, so untouched entries naturally age out. **Don't enable
  until the lastSeen feature has been live for ≥ DAYS days** — older
  entries fall back to `resolvedAt`, which doesn't reflect recent
  activity, so an early run would over-prune.

`--dry-run` prints the deletion list grouped by reason without
uploading; always use it before the real run.

## ⚠️ Never read event-uncertainty-cache.json directly into context

The cache will grow with every resolution. Use the script's `stats`,
`outstanding`, `resolve`, and `prune` subcommands; never `cat` the
whole file.

## How this fits with build-report

The daily `build-report` skill is the entry point. If
`uncertaintyStats.outstanding > 0` in the health output, it hands off
to this skill. Out-of-band invocation (e.g. user types
`/event-uncertainty-resolver`) is also supported.

## Key references

- **S3 bucket:** `calendar-ripper-outofband-220483515252`
- **S3 key:** `latest/event-uncertainty-cache.json`
- **Live build errors:** `https://206.events/build-errors.json`
- **Design doc:** `docs/event-uncertainty.md`
- **Cache module:** `lib/event-uncertainty-cache.ts`
- **Merge function:** `lib/uncertainty-merge.ts`
