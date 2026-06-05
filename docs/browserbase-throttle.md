# Browserbase 24h Fetch Throttle

## Problem

`proxy: browserbase` (proxy rung 3 — see `docs/browserbase-proxy-plan.md`)
routes a source through Browserbase's Fetch API, which executes JS in a real
browser to bypass bot detection. Every call is **billed per request**.

Browserbase sources are fetched **live in the main build**, and the build runs
far more often than daily: scheduled daily (`publish_calendars.yml`), on every
push to `main`, on `workflow_dispatch`, **and on every PR**
(`pr-preview.yml` → `build-calendars.yml`). Without throttling, each of the 7
browserbase sources (6 external ICS calendars + the `dacha_theatre` ripper) is
re-fetched on every one of those builds.

## Solution: a per-URL fetch cache with a 24h TTL

`lib/browserbase-cache.ts` stores each fetched payload keyed by request URL,
with a `fetchedAt` timestamp:

```jsonc
{
  "version": 1,
  "entries": {
    "https://www.earshot.org/?post_type=tribe_events&ical=1": {
      "fetchedAt": "2026-06-05T00:11:02.000Z",
      "status": 200,
      "contentType": "text/calendar",
      "content": "BEGIN:VCALENDAR…"
    }
  }
}
```

The cache is injected into the fetch layer (`initBrowserbaseCache` in
`lib/calendar_ripper.ts`, before the parallel rip/fetch phase). Inside
`createBrowserbaseFetch` (`lib/config/proxy-fetch.ts`):

1. **Fresh hit** (entry younger than the TTL) → return the cached payload,
   **no Browserbase call**. The API key isn't even required in this path.
2. **Miss / stale** → perform a real Browserbase fetch; cache the result
   (only `2xx` responses, so transient error pages don't poison the cache).
3. **Live failure with a stale copy present** → serve the stale copy so events
   aren't lost, and record a *stale serve* (see Reporting below).

Because the cached payload is re-parsed on every build (external ICS is parsed
normally; the dacha ripper re-runs against cached page HTML), **the events
index stays correct** — only the network call is skipped. For the dacha ripper,
caching the homepage URL means the same Humanitix sub-pages are requested each
build and are themselves served from cache, so within the window the ripper
makes zero Browserbase calls.

The TTL defaults to **24h** and is overridable via the
`BROWSERBASE_CACHE_TTL_HOURS` env var (eases testing / manual cache busting;
`0` forces every entry stale).

## Persistence: GitHub Actions Cache

The cache is round-tripped through the **GitHub Actions Cache**, not S3.
`build-calendars.yml` restores `browserbase-cache.json` before
`generate-calendars` and saves it after, using an immutable per-run key plus a
`restore-keys` prefix (the same pattern as the `claude-routine-last-fired`
rate limit in `publish_calendars.yml`):

```yaml
key: browserbase-cache-v1-${{ github.run_id }}   # never an exact hit
restore-keys: |
  browserbase-cache-v1-                           # → newest existing entry
```

Authoritative freshness lives in each entry's `fetchedAt`, so the Actions Cache
is just a carrier — a restored-but-old entry is still treated as stale.

**Default-branch read-through:** Actions Cache lets a branch read caches from
the default branch. So PR preview builds *read* the cache the daily `main`
build writes and almost never hit Browserbase themselves; a PR build's own save
is scoped to the PR and can't pollute `main`.

**Cold start / forks:** an empty committed `browserbase-cache.json`
(`{"version":1,"entries":{}}`) is the baseline when no Actions Cache entry
exists (first run, or a fork PR without cache access). Never commit a populated
version — let the Actions Cache hold the live data.

## Reporting: `proxyStaleServes`

When step 3 above fires (live fetch failed → stale copy served), the build
records it under a new **non-fatal** category in `output/build-errors.json`:

```jsonc
"proxyStaleServes": [
  { "source": "earshot-jazz", "url": "https://…", "cachedAt": "2026-06-03T00:00:00Z", "ageHours": 49, "error": "HTTP 403: Forbidden" }
]
```

These **count toward `totalErrors`** (like outstanding uncertain events) so the
`check-errors` notification, Discord ping, and Claude build-error routine all
fire — a persistent stale serve means the source or Browserbase is broken. Per
the Reporting Parity rule the category is plumbed through every surface: the
step summary and console summary (`lib/calendar_ripper.ts`), the PR comment
(`pr-preview.yml`), Discord (`notify-discord.yml`), the health dashboard
(`web/src/components/HealthDashboard.jsx`), and the build-report skill
(`skills/build-report/SKILL.md`).

A single transient blip clears itself on the next successful fetch. A source
that keeps serving stale should be investigated and, if Browserbase can no
longer reach it, retired via `skills/proxy-escalation/SKILL.md` (browserbase is
the last proxy rung).
