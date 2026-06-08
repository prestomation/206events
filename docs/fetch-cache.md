# Source Fetch Cache (TTL throttle for all sources)

## Problem

The build runs far more often than daily: scheduled daily
(`publish_calendars.yml`), on every push to `main`, on `workflow_dispatch`,
**and on every PR** (`pr-preview.yml` → `build-calendars.yml`). Without
throttling, **every source** — every ripper, every external ICS feed, every
platform API (DICE, Eventbrite, Ticketmaster, …) — is fetched live on every one
of those builds. With the volume of PRs this project runs, that means hundreds
of upstreams hit many times a day even though their content rarely changes
between runs.

This generalizes the original Browserbase-only throttle into a single
**general-purpose fetch cache for all sources**.

## Solution: a per-key fetch cache with a TTL

`lib/fetch-cache.ts` stores each fetched payload keyed by request key, with a
`fetchedAt` timestamp:

```jsonc
{
  "version": 1,
  "entries": {
    "https://www.geekwire.com/?post_type=tribe_events&ical=1": {
      "fetchedAt": "2026-06-05T00:11:02.000Z",
      "status": 200,
      "contentType": "text/calendar",
      "content": "BEGIN:VCALENDAR…"
    }
  }
}
```

**Cache key (`keyFor`).** A plain `GET` with no body keeps the **bare URL** as
its key (the common case, and back-compatible with the old URL-keyed format).
Requests with a body (e.g. GraphQL/POST APIs) use `METHOD url\n<sha256(body)>`
so different queries to the same endpoint are distinct entries. Auth headers
(API keys/tokens) are **never** part of the key.

The cache is injected into the fetch layer once per build (`initFetchCache` in
`lib/calendar_ripper.ts`, before the parallel rip/fetch phase). Every fetch
function returned by `getFetchForConfig` is wrapped in `withCache`
(`lib/config/proxy-fetch.ts`):

1. **Fresh hit** (entry younger than the TTL) → return the cached payload,
   **no network call**.
2. **Miss / stale** → perform a real fetch; cache the result (only `2xx`
   responses, so transient error pages don't poison the cache).
3. **Live failure with a stale copy present** → serve the stale copy so events
   aren't lost, and record a *stale serve* (see Reporting below).

When no cache is injected (unit tests, single-ripper runs, the out-of-band
runner) `withCache` is a **transparent pass-through** — it returns the
underlying response untouched, so nothing changes for those callers.

Because the cached payload is **re-parsed on every build** (external ICS is
parsed normally; rippers re-run against cached page HTML/JSON), the events index
stays correct — only the network call is skipped. This is the key property for
iteration: **you can add a source or change parsing logic and only pay the live
fetch for a given URL once.** Subsequent builds re-run your new parser against
the cached body with zero outgoing traffic.

The TTL defaults to **24h** (matching the daily cron) and is overridable via the
`FETCH_CACHE_TTL_HOURS` env var (eases testing / manual cache busting — set a
large value for a long local iteration session, or `0` to force every entry
stale). Entries older than `MAX_ENTRY_AGE_DAYS` (30) are pruned on save so
removed sources and changed URLs don't accumulate in the persisted blob.

## Working on a single source: `ONLY_SOURCE`

`ONLY_SOURCE=<name>` (comma-separated for several) restricts the build to the
named source(s): every other source is skipped — no fetch, no parse — and the
new-source gates and deployed-site probe are skipped (a single-source build
isn't a complete manifest). This is the standard way to **add or fix a source**:

```sh
ONLY_SOURCE=my-venue npm run generate-calendars
```

The first run fetches only that source's URLs (not the whole site); combined
with the fetch cache, every re-run after that re-parses the one cached body with
zero network. For a long session, pair it with `FETCH_CACHE_TTL_HOURS=99999` so
nothing expires mid-iteration.

Locally the cache is just `fetch-cache.json` on disk (the GitHub Actions Cache
only exists in CI): the first full build fetches everything once and writes the
file; subsequent local builds within the TTL make no network calls.

## Persistence: GitHub Actions Cache

The cache is round-tripped through the **GitHub Actions Cache**, not S3.
`build-calendars.yml` restores `fetch-cache.json` before `generate-calendars`
and saves it after, using an immutable per-run key plus a `restore-keys` prefix
(the same pattern as the `claude-routine-last-fired` rate limit in
`publish_calendars.yml`):

```yaml
key: fetch-cache-v1-${{ github.run_id }}   # never an exact hit
restore-keys: |
  fetch-cache-v1-                           # → newest existing entry
```

Authoritative freshness lives in each entry's `fetchedAt`, so the Actions Cache
is just a carrier — a restored-but-old entry is still treated as stale.

**Default-branch read-through:** Actions Cache lets a branch read caches from
the default branch. So PR preview builds *read* the cache the daily `main` build
writes and make almost no outgoing requests themselves; a PR build's own save is
scoped to the PR and can't pollute `main`.

**Cold start / forks:** an empty committed `fetch-cache.json`
(`{"version":1,"entries":{}}`) is the baseline when no Actions Cache entry
exists (first run, or a fork PR without cache access). Never commit a populated
version — let the Actions Cache hold the live data.

## Reporting: `proxyStaleServes`

When step 3 above fires (live fetch failed → stale copy served), the build
records it under a **non-fatal** category in `output/build-errors.json`:

```jsonc
"proxyStaleServes": [
  { "source": "earshot-jazz", "url": "https://…", "cachedAt": "2026-06-03T00:00:00Z", "ageHours": 49, "error": "HTTP 403: Forbidden" }
]
```

(The key name is retained from the Browserbase-era throttle for compatibility;
it now covers stale serves from any source, not just proxied ones.) These
**count toward `totalErrors`** (like outstanding uncertain events) so the
`check-errors` notification, Discord ping, and Claude build-error routine all
fire — a persistent stale serve means the source (or, for browserbase sources,
Browserbase) is broken. Per the Reporting Parity rule the category is plumbed
through every surface: the step summary and console summary
(`lib/calendar_ripper.ts`), the PR comment (`pr-preview.yml`), Discord
(`notify-discord.yml`), the health dashboard
(`web/src/components/HealthDashboard.jsx`), and the build-report skill
(`skills/build-report/SKILL.md`).

A single transient blip clears itself on the next successful fetch. A source
that keeps serving stale should be investigated; for a browserbase source that
Browserbase can no longer reach, retire it via `skills/proxy-escalation/SKILL.md`
(browserbase is the last proxy rung).
