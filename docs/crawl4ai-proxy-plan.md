# Crawl4AI Proxy Implementation Plan

Status: **proposal** (not yet implemented). This doc proposes adding
[crawl4ai](https://github.com/unclecode/crawl4ai) as a new rung on the proxy
escalation ladder and lays out the work — including a mandatory phase that
**tests every current proxy source through crawl4ai** before anything ships.

## Background: the ladder today

The fetch-proxy escalation ladder (`docs/outofband.md`,
`docs/proxy-verification.md`) is currently:

```
false → outofband → browserbase → disabled
```

| Rung | IP | JS execution | Cost | Runs in |
|------|----|--------------|------|---------|
| `false` | GitHub Actions (datacenter) | ❌ | free | main CI build |
| `outofband` | residential (home runner) | ❌ (plain `fetch`) | free | out-of-band runner → S3 → main build |
| `browserbase` | Browserbase (datacenter) | ✅ (real browser) | paid, per-fetch credits | main CI build (live) |

Two failure modes force escalation:

- **IP-gated** — the source 403s datacenter IPs but serves a residential one.
  `outofband` fixes this.
- **JS-gated** — the source serves a JavaScript bot-challenge page (SiteGround
  `sgcaptcha`, Cloudflare challenge, NinjaFirewall) that only a real browser can
  clear. `browserbase` fixes this.

There is a **gap**: a source that is *both* IP-gated **and** JS-gated. Browserbase
executes JS but from a **datacenter** IP, so a residential-IP-gated + JS-gated
source can defeat every current rung. There is also a **cost/availability**
weakness: browserbase is the only JS-capable rung, it is metered (HTTP 402 when
credits lapse takes down *all* browserbase sources at once — see the billing
carve-outs in `skills/proxy-escalation/SKILL.md`), and it is a third-party SaaS
dependency.

## What crawl4ai is

crawl4ai is an open-source, self-hosted crawler. Deployment relevant to us:

- **Docker server** — a FastAPI app (default port **11235**) wrapping Playwright
  + Chromium. Endpoints include `POST /crawl` (and simpler `/md`, `/html`
  helpers) that return the page's rendered HTML, cleaned HTML, and markdown plus
  metadata (`status_code`, `success`, `html`, `cleaned_html`, ...).
- **JS rendering** — full browser navigation; waits for async content, runs
  arbitrary JS, handles lazy-load. Clears the same JS challenges browserbase does.
- **Stealth / undetected mode** — mimics a real user; optional undetected-Chrome
  engine.
- **Proxy support** — `BrowserConfig`/`ProxyConfig` can chain upstream proxies.
- **Auth** — JWT, secure-by-default; binds loopback unless given a token.
- **Footprint** — ~2 GB image, ~300 MB+ idle RAM.

The decisive property: crawl4ai runs **on a machine we control**. Stand it up on
the existing residential out-of-band runner and it is the only option that
combines **residential IP + real-browser JS execution + zero marginal cost**. It
fills the IP-gated∧JS-gated gap and gives us a free JS-capable rung.

## Where crawl4ai fits: `false → outofband → crawl4ai → browserbase`

Insert crawl4ai **between `outofband` and `browserbase`**:

| Rung | IP | JS | Cost | Runs in |
|------|----|----|------|---------|
| `outofband` | residential | ❌ | free | out-of-band runner |
| **`crawl4ai`** | **residential** | **✅** | **free** | **out-of-band runner** |
| `browserbase` | datacenter | ✅ | paid | main CI build (live) |

Rationale for this ordering:

- `outofband` stays the first proxy rung: a plain residential `fetch` is cheaper
  and faster than spinning a browser, and many sources only need the residential
  IP.
- `crawl4ai` is the escalation when a residential fetch hits a JS wall — it adds
  JS execution *without* leaving the residential IP, and it is free.
- `browserbase` becomes the **last managed resort**: it runs live in CI with no
  dependency on the home runner being up, so it is the right fallback when even
  the home environment can't reach a source, or when we don't want a source
  gated on the runner's availability. It stays at the top of the ladder.

crawl4ai does **not** replace browserbase. But note the Phase 4 upside: once
crawl4ai is proven, most current `browserbase` sources (SiteGround/NinjaFirewall
JS challenges) can move **down** to the free `crawl4ai` rung, shrinking
browserbase to a small emergency set and cutting cost / 402 exposure.

## Integration model

Two options. **Option A is recommended**; Option B is documented as the
alternative and possible future direction.

### Option A (recommended): a residential rung on the out-of-band runner

`proxy: "crawl4ai"` sources are fetched by the **out-of-band runner**
(`scripts/generate-outofband.ts`), exactly like `outofband` sources today — the
main CI build **skips** them and picks up the pre-fetched `.ics` + structured
events from S3. The only new moving part is that, for crawl4ai sources, the
runner routes the fetch through a **local crawl4ai Docker container**
(`http://localhost:11235`) instead of a plain `fetch`.

Why this is the low-risk path:

- **Reuses all existing out-of-band plumbing** — the S3 upload, `outofband-report.json`,
  `outofband-events.json`, `download-outofband.ts`, manifest merge, the fatal-gate
  exemption for unproven proxy sources, and the `proxy-verification.json` counter
  all already handle "a source fetched off-CI." crawl4ai is just another such
  source class.
- **No new GitHub secret** — the crawl4ai server is reached over `localhost` on
  the runner; the main CI build never talks to it. (Contrast browserbase, which
  needed `BROWSERBASE_API_KEY` wired into the workflow.) The container's JWT stays
  on the runner.
- **No public exposure** — we never expose the home server to the internet.

Downside: like `outofband`, a `crawl4ai` source depends on the home runner (now
also on its Docker container) being up. That is the same availability class we
already accept for outofband, and browserbase remains above it for anything that
must not be gated on the runner.

### Option B (alternative / future): a live CI rung like browserbase

Host crawl4ai on a publicly reachable server (VPS or a residential proxy box),
and have the **main build** POST to it live with a JWT — mirroring how
browserbase is fetched live in CI. This would let crawl4ai *replace* browserbase
entirely (self-hosted, no per-fetch credits).

Rejected as the first step because it requires: standing up and securing a
public endpoint, managing a JWT repo secret, and giving that host a good
(ideally residential) IP — which is most of browserbase's value proposition
reimplemented. Revisit only if we later want to drop the browserbase dependency;
the schema/fetch work from Option A is reused as-is.

## The raw-content problem (primary design risk)

Everything downstream expects **raw bytes**: external sources need the verbatim
`text/calendar` ICS body; HTML rippers need the page HTML. crawl4ai's native
output is **cleaned/markdown**, and — more importantly — a browser is an awkward
tool for fetching a non-HTML file: navigating Chromium to a `.ics` URL may
trigger a download or wrap the text in a `<pre>`/viewer document rather than
handing back the raw feed.

This splits by source type:

- **HTML rippers** (`wayward_music`, `flying_lion_brewing`, future scrapers) —
  a natural fit. Request rendered HTML from crawl4ai (`result.html`) and feed it
  to the ripper's existing parser. This is exactly what crawl4ai is built for.
- **External ICS feeds** — riskier. Two candidate strategies, to be settled by
  the Phase 0 test:
  1. **Direct body extraction** — ask crawl4ai for the raw response and pull the
     ICS text out (`result.html` de-wrapped, or a raw/`file`-mode response).
     Simplest if crawl4ai returns the feed faithfully.
  2. **Challenge-clear + cookie replay** (robust fallback) — use crawl4ai to load
     the origin, clear the JS challenge, and harvest the clearance cookie; then
     do a **plain residential `fetch`** of the `.ics` with that cookie from the
     same runner. This cleanly separates "beat the bot wall" (browser) from "get
     the raw feed" (plain fetch) and sidesteps content-type mangling entirely.

The `createCrawl4aiFetch()` wrapper (below) hides whichever strategy wins behind
the same `FetchFn` contract the other rungs use, returning a `Response` with the
correct status/body/content-type.

## Phase 0 — test every current proxy source (the explicit ask, gate for everything else)

Before writing integration code, **stand up crawl4ai on the runner and run every
current proxy source through it**, producing a results matrix like the one in
`docs/browserbase-proxy-plan.md`. This must run **from the residential runner**
(where the home IP + the container live) — it cannot be exercised from CI or a
web session.

### Sources to test (snapshot at time of writing — 21)

**`proxy: outofband` (9):**

| Source | Kind |
|---|---|
| `seattle-city-of-lit` | external ICS |
| `impact-raves` | external ICS |
| `go-latin-dance-seattle` | external ICS |
| `united-indians-daybreak-star` | external ICS |
| `seattle-dsa` | external ICS |
| `worksource-north-seattle` | external ICS |
| `worksource-downtown-seattle` | external ICS |
| `wayward_music` | HTML ripper |
| `flying_lion_brewing` | HTML ripper |

**`proxy: browserbase` (12):**

| Source | Kind |
|---|---|
| `capitol-hill-seattle` | external ICS |
| `el-centro-de-la-raza` | external ICS |
| `seattledances` | external ICS |
| `earshot-jazz` | external ICS |
| `urban-league-seattle` | external ICS |
| `seattle-childrens-museum` | external ICS |
| `woodland-park-zoo` | external ICS |
| `langston` | external ICS |
| `hugo-house` | external ICS |
| `populus-seattle` | external ICS |
| `early-music-seattle` | external ICS |
| `shunpike` | external ICS |

(Regenerate the live list before running:
`rg -l 'proxy:\s*(outofband|browserbase)' sources/`.)

### Test harness — `scripts/test-crawl4ai.ts`

A standalone script (not wired into the build) that, for each source above:

1. Reads its `icsUrl` (external) or `url` (ripper) from config.
2. Fetches it through the local crawl4ai container via `createCrawl4aiFetch()`.
3. Records: HTTP status, byte size, content-type, whether the body is a valid
   feed (`BEGIN:VCALENDAR` for ICS) or parseable HTML, resulting **future**
   event count, elapsed time, and **pass/fail**.
4. For ICS sources, tests **both** raw-content strategies (direct extraction vs
   challenge-clear + cookie replay) and records which yields a valid feed.
5. Emits a Markdown matrix.

### What the matrix decides

- **Viability** — does crawl4ai clear the JS challenges browserbase clears, from
  the residential IP? (Expect yes for SiteGround/NinjaFirewall.)
- **Which raw-content strategy** to implement for ICS feeds.
- **Down-migration candidates** — every current `browserbase` source that
  crawl4ai handles can move to the free rung in Phase 4.
- **The IP∧JS gap** — any source that neither `outofband` nor `browserbase`
  reaches today but crawl4ai does (residential + JS) is the headline win.
- **Hard failures** — sources crawl4ai *can't* clear (e.g. Cloudflare Turnstile,
  genuinely dead feeds like `langston`) stay on browserbase or get retired.

Paste the completed matrix into this doc and the implementation PR.

## Implementation phases (post-gate)

Proceed only after the Phase 0 matrix shows crawl4ai is viable.

### Phase 1 — fetch capability (schema + wrapper + tests)

- **`lib/config/schema.ts`** — add `"crawl4ai"` to the `proxy` enum in **both**
  `configSchema` and `externalCalendarSchema`:
  `z.enum(["outofband", "crawl4ai", "browserbase"]).or(z.literal(false))`.
- **`lib/config/proxy-fetch.ts`** — add `"crawl4ai"` to `ProxyType`; implement
  `createCrawl4aiFetch()` (POSTs to `${CRAWL4AI_BASE_URL}/crawl` with the JWT,
  extracts raw content per the winning strategy, returns a `Response`), wrapped
  in `withCache` like the others; branch it into `getFetchForConfig`.
- **`lib/config/proxy-fetch.test.ts`** — mirror the browserbase tests: request
  shape, raw-body extraction, non-OK handling, missing `CRAWL4AI_BASE_URL`, and
  cache behavior (fresh hit / miss / stale-serve).
- **`.env.example`** — add `CRAWL4AI_BASE_URL=http://localhost:11235` and
  `CRAWL4AI_API_TOKEN=`.

No sources migrated yet; ladder unchanged.

### Phase 2 — wire into the out-of-band runner + main-build skip

- **`scripts/generate-outofband.ts`** — extend the source filters to include
  `proxy === "crawl4ai"` alongside `"outofband"`, and route crawl4ai sources'
  fetches through `createCrawl4aiFetch()` (rippers already get their fetch via
  `getFetchForConfig`; the external-ICS loop must pick the crawl4ai fetch for
  crawl4ai externals). Everything else (S3 upload, report, events file) is
  unchanged.
- **`lib/calendar_ripper.ts`** — wherever the build special-cases proxy sources,
  add `crawl4ai` next to `outofband`/`browserbase`:
  - the out-of-band **skip** filters (`c.config.proxy === "outofband"` →
    `... || === "crawl4ai"`, and the external-calendar equivalents at the
    live/outofband split);
  - the **proxy-source tracking** set (`proxy === "outofband" || "browserbase"`
    → include `"crawl4ai"`), which drives the fatal-gate exemption for unproven
    proxy sources.
- **Pilot** one external ICS + one ripper end to end: runner → S3 →
  `download-outofband` → main build → live site, confirming events appear with
  full fidelity.

### Phase 3 — escalation ladder + reporting parity

- **`lib/proxy-verification.ts`** (+ `.test.ts`) — insert `crawl4ai` into the
  rung order and add a `promote-to-crawl4ai` recommendation; `outofband`
  escalates to `crawl4ai` (3 strikes), `crawl4ai` to `browserbase`, `browserbase`
  to `retire`.

  **⚠️ Capability-inversion caveat — the ladder is not strictly monotonic.**
  crawl4ai (residential IP + JS) is *more* capable than browserbase (datacenter
  IP + JS) for the very sources crawl4ai exists to serve: an
  **IP-gated ∧ JS-gated** source clears crawl4ai but browserbase's datacenter IP
  can't get past the IP gate. Blindly escalating such a source `crawl4ai →
  browserbase` promotes it to a rung guaranteed to fail, wasting a PR and three
  more build cycles before it retires. So the escalation out of `crawl4ai` must
  branch on *why* it's failing:
  - **crawl4ai fails with a fresh JS/anti-bot wall it can't clear (not an IP
    issue)** → `promote-to-browserbase` is correct (browserbase's managed
    browser + stealth may clear a challenge the self-hosted image can't).
  - **crawl4ai fails on a source already known to be IP-gated** (it only ever
    worked from the residential IP — e.g. it previously passed at `outofband`,
    or the Phase 0 matrix tagged it IP-gated) → **skip browserbase and go
    straight to `retire`**, since the datacenter rung cannot help.

  Record the IP-gated signal (from Phase 0 and/or the source's ladder history)
  so `evaluateProxyVerification` can pick the right branch instead of always
  climbing to browserbase. Cover both branches in `proxy-verification.test.ts`.
- **`scripts/generate-outofband.ts`** counter logic — crawl4ai outcomes are
  determined from the runner's own fetch this run (like `outofband`), since
  crawl4ai runs on the runner, not live in CI.
- **`skills/proxy-escalation/SKILL.md`** and **`skills/outofband-generate/SKILL.md`**
  — update the ladder to `outofband → crawl4ai → browserbase`; Mode A now tests
  three rungs; add the `promote-to-crawl4ai` branch to Mode B.
- **Reporting parity** (per AGENTS.md "Reporting Parity") — the `crawl4ai` rung
  must appear everywhere the existing rungs already do: the health dashboard's
  Proxy tab, the PR comment, the build step summary, the Discord notification,
  and the build-report skill. No new counter category is introduced (it reuses
  `pendingProxyVerification`), but the rung label is new.
- **Docs** — update `docs/outofband.md`, `docs/proxy-verification.md`, and the
  proxy-ladder table in `AGENTS.md`.

### Phase 4 — migrate proven browserbase sources down (cost win)

Using the Phase 0 matrix, open a PR (or a small batch) moving each browserbase
source crawl4ai proved it can handle from `proxy: browserbase` to
`proxy: crawl4ai`. Keep browserbase configured and available as the top-of-ladder
fallback for anything crawl4ai can't clear. This cuts browserbase credit usage
toward zero and removes the 402-takes-down-everything single point of failure.

## Infrastructure

- **`infra/crawl4ai/`** — a `docker-compose.yml` pinning the crawl4ai image, plus
  a `README.md` covering: run on the residential runner, bind loopback, set the
  JWT, resource sizing (~2 GB image, budget RAM/CPU for a browser), health check
  (`GET /health`; verify the exact path against the pinned image version), and
  how the runner's cron reaches it on `localhost`.
- The runner's cron/setup gains a step to ensure the container is up before
  `generate-outofband` runs (and a clear failure if it isn't, so a down container
  surfaces as a proxy-verification signal rather than a silent zero).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| ICS content-type mangled by browser navigation | Phase 0 picks the raw-content strategy; challenge-clear + cookie-replay fallback avoids browser-rendering the feed entirely. |
| New dependency on the home runner + its container | Same availability class as `outofband`; browserbase stays above it for must-not-be-gated sources; container-down surfaces via the counter, not a silent 0. |
| Crawl4ai slower than plain fetch (full browser) | Bounded concurrency (runner already caps at `CONCURRENCY`), per-fetch timeout, and it only runs for the crawl4ai subset. |
| Hard challenges (Cloudflare Turnstile) crawl4ai can't clear | Those sources stay on browserbase or are retired — the ladder already models "top rung exhausted → retire". |
| Stealth/anti-bot arms race, image drift | Pin the image version in compose; the Phase 0 harness is re-runnable as a regression check. |
| JWT/secret handling | Server binds loopback; token lives only on the runner; nothing added to CI secrets. |

## Files to change (implementation checklist)

- `lib/config/schema.ts` — `crawl4ai` in both proxy enums
- `lib/config/proxy-fetch.ts` — `createCrawl4aiFetch()` + `getFetchForConfig` branch + `ProxyType`
- `lib/config/proxy-fetch.test.ts` — crawl4ai fetch tests
- `scripts/generate-outofband.ts` — include + route crawl4ai sources; counter outcomes
- `lib/calendar_ripper.ts` — skip filters, proxy-source tracking, fatal-gate exemption
- `lib/proxy-verification.ts` (+ `.test.ts`) — ladder order + `promote-to-crawl4ai`
- `skills/proxy-escalation/SKILL.md`, `skills/outofband-generate/SKILL.md` — ladder wording
- `docs/outofband.md`, `docs/proxy-verification.md`, `AGENTS.md` — ladder tables
- `.env.example` — `CRAWL4AI_BASE_URL`, `CRAWL4AI_API_TOKEN`
- `infra/crawl4ai/` — `docker-compose.yml` + `README.md`
- `scripts/test-crawl4ai.ts` — Phase 0 source-testing harness
- Reporting surfaces (health dashboard, PR comment, step summary, Discord, build-report skill) — surface the `crawl4ai` rung

## Cost

- crawl4ai itself: **$0** (self-hosted on the existing runner; only marginal
  electricity/RAM).
- Expected effect on browserbase spend: **down** — Phase 4 moves most sources off
  the metered rung, leaving browserbase as a rarely-hit fallback.
