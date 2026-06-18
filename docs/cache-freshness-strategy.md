# Cache Freshness Strategy

How the build keeps its two caches fresh without paying a cold-start (or
"everything-expired-at-once") penalty. Companion to `docs/fetch-cache.md`
(the fetch cache mechanics) and the geo-cache section of
`docs/github-native-caches.md`.

## Background

The `Generate calendars` step is the build's long pole. Its cost is almost
entirely network: fetching each source and (for community calendars) geocoding
each event location. Both are cached, but a build that runs with a *cold* cache
re-does all of it — which is exactly what made one PR-preview build take ~28
minutes while warm `main` builds finish in ~5. The cache hit/miss counters
(`cacheStats` in `build-errors.json`, see `docs/fetch-cache.md`) make this
observable per build.

## Geo-cache: permanent by nature

Geocode results are immutable — a location string resolves to the same
coordinates forever — so the geo-cache has **no TTL**: `resolveEventCoords`
(`lib/geocoder.ts`) returns a cached coordinate immediately, and only *new*
locations ever hit Nominatim. Corrections to a bad/stale coordinate happen out
of band via `KNOWN_VENUE_COORDS` (which overrides even a cached `unresolvable`
marker) plus a cache-key version bump; see the geo-cache section of
`.kiro`/`CLAUDE.md`.

The only way the geo-cache goes "cold" is loss of the persisted file. It lives
in the GitHub Actions Cache (restored at build start, saved at end), and the
**daily scheduled `main` build re-saves the key every day**, keeping it well
inside the eviction window. A 90-day artifact backup is also uploaded each run
(`if: always()`) as a manual safety net. No TTL or refresh logic is needed —
the geo-cache is intentionally left as-is.

## Fetch cache: 7-day cap + proactive oldest-slice refresh

Source bodies *do* change, so the fetch cache (`lib/fetch-cache.ts`) has a TTL.
The previous design used a hard 24-hour TTL: every entry older than a day
re-fetched live on the next build, so a build could face a wall of refetches at
once (the cliff), and a PR preview whose base cache had aged out paid the full
cold cost.

The strategy has two parts:

### 1. Raise the hard cap to 7 days

`DEFAULT_TTL_HOURS` is now `24 * 7`. An entry younger than 7 days is eligible to
be served from cache; older than that it always refetches. (Still overridable
per-run via `FETCH_CACHE_TTL_HOURS`.) This is the *safety cap*, not the normal
refresh cadence.

### 2. Proactively refresh the oldest ~20% — on `main` builds only

Freshness *within* the 7-day window is maintained by proactively refreshing a
slice of the cache each `main`/scheduled build, so content is continuously
rolled over and nothing actually drifts to the 7-day edge:

- At build start, when proactive refresh is enabled, the build calls
  `selectOldestEntriesForRefresh(cache, fraction)` (default `fraction` 0.2) to
  pick the **oldest** ~20% of entries by `fetchedAt`, and
  `setProactiveRefreshKeys(...)` marks them. `lookupFreshEntry` then treats
  those keys as a forced miss, so they re-fetch live this build even though
  they're within the cap.
- Selecting the **oldest** slice (rather than a random sample) guarantees even
  coverage: over ~5 refreshing builds every entry rotates through, and the
  oldest are always the ones refreshed, so none silently approaches the cap.
- Per refreshing build the outbound work is bounded to ≈ the oldest 20% + any
  entry past the 7-day cap + any brand-new source.

### Gating: `main` refreshes, PR previews read-only

Proactive refresh is gated behind the `FETCH_PROACTIVE_REFRESH` env var, set to
`true` only by `publish_calendars.yml` (the `main`/scheduled build) via the
reusable workflow's `proactive-refresh` input. PR-preview builds
(`pr-preview.yml`) leave it `false`:

- **`main` builds** maintain the shared cache — refresh the oldest slice, keep
  everything continuously fresh.
- **PR previews** read entirely from the warm cache (≤7 days) and refresh
  nothing, so they stay fast and add almost no outbound traffic — *except* a
  brand-new source a PR introduces, which has no cache entry and therefore
  misses and fetches live (so new sources are still exercised for real).

Tunables (env): `FETCH_CACHE_TTL_HOURS` (cap), `FETCH_REFRESH_FRACTION`
(slice size, default 0.2), `FETCH_PROACTIVE_REFRESH` (`true` to enable; set by
the main workflow).

### PR builds are read-only: cache scope and the "self-poisoning" trap

For PR previews to "ride the warm cache," they must restore **main's** cache,
not their own. GitHub Actions cache restore searches the **current ref's scope
first** (here the PR's `refs/pull/<n>/merge`) and only falls through to the
**default branch** if it finds *nothing* in the current scope. The restore key
is an immutable per-run id with a `restore-keys:` prefix fallback, so any entry
matching the prefix *in the PR's own scope* wins before main's is ever
consulted.

This bit us once: a PR-preview build was **cancelled a few seconds into
`Generate calendars`** (by the `cancel-in-progress` concurrency rule when a new
commit landed). Because the Save steps were `if: always()`, the cancelled run
wrote a **near-empty** fetch cache into the PR's scope. The PR's next run then
matched that sparse in-scope entry, never fell through to main's warm 11.5 MB
cache, and rebuilt almost cold (**~5% fetch hit** instead of ~98%). The geo
cache only dropped to ~80% in the same incident because geocodes are immutable,
so even a partial geo cache stays mostly useful.

**Fix: PR builds never save either cache** — the Save steps are gated
`if: always() && github.event_name != 'pull_request'`. With nothing ever
written to a PR's scope, every PR restore falls through to the default-branch
cache main writes, deterministically. Main keeps its unique per-run key (so the
proactive oldest-slice refresh above still persists on every main build), and
PR builds stop writing ~11.5 MB caches they never benefit from — roughly halving
cache write churn against the 10 GB repo budget. New sources a PR adds still
miss (no entry anywhere) and fetch live, so they're exercised for real.

### Why a failed proactive refresh is safe

A forced-refresh entry that fails its live fetch falls back to the last good
cached copy and is recorded as a `proxyStaleServes` entry (see
`docs/fetch-cache.md`) — identical to any other refresh failure. The build
still uses the good body; the only effect is the source is flagged, and it
clears on the next successful fetch.
