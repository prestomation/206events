# GitHub-Native Caches (retiring S3 from the main build)

The main calendar build (`.github/workflows/build-calendars.yml`) used to
persist two caches in S3: `geo-cache.json` and
`event-uncertainty-cache.json`. Both now live in GitHub, removing the S3
dependency — and the AWS-credential requirement — from the main build's
critical path. This makes the caches editable from web sessions (which
have no AWS access) and removes a class of "works in CI, fails for the
agent" friction.

The **out-of-band runner** (`scripts/generate-outofband.ts`) is the only
remaining S3 consumer. It is intentionally out of scope here and keeps
using S3 for its `.ics` artifacts, report, proxy-verification counters,
and its own geo/uncertainty caches.

## `event-uncertainty-cache.json` — committed file is the cache

The committed file in the repo root **is** the cache. There is no
download or upload:

- CI reads the committed file at the start of every build
  (`loadUncertaintyCache('event-uncertainty-cache.json')`).
- The event-uncertainty-resolver skill edits the committed file via
  `uncertainty-cache.py resolve` / `prune`, commits it, and opens a PR.
  Once merged, the next build picks it up.
- Build-time writes (the `lastSeen` stamp on consulted entries) happen in
  the runner's working copy and are **discarded** when the runner is
  reclaimed. Only PR-committed changes persist. Consequently the
  `--lastseen-older-than` prune flag can't depend on accumulated stamps;
  use `--orphan-prefixes` and `--date-in-key-older-than`.

This is the same model that already worked in practice: web sessions
without S3 access were committing resolutions to the file and CI was
honoring them (committed-wins). Removing S3 just makes the committed file
the *sole* authority instead of an override layer.

### Why the old two-layer model is gone

Previously the build merged an S3 copy with the committed file
(committed-wins). That existed so CI builds and the out-of-band runner
could accumulate resolutions in S3 while still letting web sessions
override via commits. With the resolver writing directly to the committed
file and opening PRs, the S3 layer added complexity without value — every
durable resolution is a commit, and the git history is the audit log.

## `geo-cache.json` — GitHub Actions Cache

The build persists the geo-cache through `actions/cache` (the same
mechanism as the source fetch cache):

- **Restore** at start: `actions/cache/restore` with key
  `geo-cache-v1-${{ github.run_id }}` and `restore-keys: geo-cache-v1-`,
  so the newest prior cache is restored. A cold cache leaves the empty
  committed baseline in place and the build re-geocodes from scratch.
- **Save** at end: `actions/cache/save` under the per-run key.
- **Backup**: the `geo-cache` artifact (90-day retention) is still
  uploaded every build, so the data survives a cache eviction.
- **Inspection**: the build mirrors the cache into `output/geo-cache.json`,
  published read-only at `https://206.events/geo-cache.json`.

### Cold-start behavior

GitHub Actions caches evict after ~7 days of no access. For a project that
builds daily this is rarely hit, but when it is, the build re-geocodes
every location once (slower, rate-limited to 1 req/sec). This is a
feature as much as a cost: the re-geocode runs the *current* normalization
logic, so legacy "dirty key" entries (HTML entities, escaped commas,
truncated strings) don't survive a cold start. The old S3-based
`geo-cache.py purge` / `purge-stale-geocache.py` cleanup is therefore
obsolete and was removed.

### Fixing geocoding without S3

The Actions Cache isn't writable from outside a workflow run, so agents
don't edit `geo-cache.json` directly. Instead:

- **Missing/unresolvable venue** → add it to `KNOWN_VENUE_COORDS` (or a
  lookup table) in `lib/geocoder.ts`. It's consulted ahead of the
  unresolvable-cache short-circuit, so it overrides a stale `unresolvable`
  marker on the next build. Pure-data change, committed via PR.
- **Wrong cached coordinate** (a bad Nominatim hit already cached as
  `{lat,lng}`) → `KNOWN_VENUE_COORDS` won't override an existing
  coordinate, so bump the cache key version (`geo-cache-v1-` →
  `geo-cache-v2-`) in `build-calendars.yml` to force a cold re-geocode.

## AWS credentials in the main build

The `Configure AWS credentials` step remains because the out-of-band
*download* (`npm run download-outofband`) still reads from S3. But that
download is graceful (exits 0 if the bucket is unreachable), so the
credentials step is now `continue-on-error: true` — a credential failure
no longer fails the build. Fork PRs and credential hiccups simply build
without out-of-band calendars.

## What did NOT change

- The out-of-band runner and its S3 usage (`generate-outofband.ts`,
  `download-outofband.ts`, `docs/outofband.md`,
  `infra/authenticated-proxy/`).
- The proxy escalation ladder and `pendingProxyVerification` queue.
- The Browserbase live-fetch path.
- The source fetch cache (already GitHub-Actions-Cache-backed).
