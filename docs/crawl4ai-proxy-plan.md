# Crawl4AI as a Proxy Option — Investigation & Findings

Status: **investigated, with an empirical result that redirects the original
plan.** This doc evaluated adding [crawl4ai](https://github.com/unclecode/crawl4ai)
(a self-hosted Playwright/Chromium browser engine) as a new proxy rung —
specifically the hypothesis that it could run **in CI, before `outofband`**, to
rescue sources that are JS-challenge-gated ("captcha") but not IP-gated
("network restriction").

**That hypothesis was tested from real GitHub Actions IPs and did not hold.**
See the matrix below.

## TL;DR

- **A browser in CI clears nothing a plain fetch can't.** Across three probes
  run from GitHub Actions runners — vanilla headless Chromium (×2) and the
  **actual crawl4ai stealth engine** (×1) — **0 of the blocked sources became
  reachable.** The SiteGround `sgcaptcha` challenge is gated on **IP
  reputation**, not JS capability: a real browser runs the challenge JS, sets
  the cookie, reloads, and SiteGround still re-serves the `202` challenge to the
  GHA IP. So these are **network/IP-gated, not solvable-in-CI JS challenges.**
- **⇒ A `crawl4ai`-in-CI rung placed before `outofband` would rescue zero
  current sources.** It is therefore **not implemented.**
- **crawl4ai's real (untested) niche is the residential rung** — a non-GHA IP
  *plus* JS execution, i.e. a potential **self-hosted replacement for
  `browserbase`**. That can only be proven from the residential out-of-band
  runner (the deferred "test from residential IP" phase), not from CI.
- **Bonus finding: 6 currently-proxied sources returned clean content directly
  from the GHA IP in *both* probe runs** — candidates for dropping the proxy,
  pending multi-build verification (WAF blocks are intermittent).
- **Confirmed raw-content problem:** crawl4ai's browser errors with `"Download
  is starting"` when navigated at a raw `.ics` URL — so even where it clears a
  wall, an ICS feed needs a **cookie-replay** fetch, not naive navigation.

## The empirical probe

Because the local dev environment's egress IP is not a GHA IP (and SiteGround's
WAF response varies by IP reputation and request rate — the same URL served
clean ICS on one hit and a hard 403 minutes later), classification could only be
done from real CI IPs. Two throwaway `workflow_dispatch` probes were run from
GitHub Actions runners:

- `scripts/probe-proxy-sources.mjs` (`.github/workflows/crawl4ai-probe.yml`) —
  every proxied source, fetched via **plain `fetch`** vs a **headless-Chromium**
  fetch that runs the sgcaptcha reload cycle and replays the clearance cookie.
- `scripts/probe-crawl4ai.py` (`.github/workflows/crawl4ai-stealth-probe.yml`) —
  the **actual crawl4ai** (`enable_stealth` + `magic`) against the challenge
  subset, to rule out that a *stealth* browser (vs vanilla Chromium) makes the
  difference.

### Results matrix (from a GitHub Actions IP)

| Source | Current proxy | Plain fetch | Headless Chromium | crawl4ai stealth | Class |
|---|---|---|---|---|---|
| `capitol-hill-seattle` | browserbase | 403/202 challenge | challenge | OTHER 200 | 🔴 IP-gated |
| `el-centro-de-la-raza` | browserbase | 403 | 403 | 202 challenge | 🔴 IP-gated |
| `seattledances` | browserbase | 202 challenge | challenge | 202 challenge | 🔴 IP-gated |
| `earshot-jazz` | browserbase | 202 challenge | challenge | 202 challenge | 🔴 IP-gated |
| `urban-league-seattle` | browserbase | 202 challenge | challenge | 202 challenge | 🔴 IP-gated |
| `shunpike` | browserbase | 202 challenge | challenge | 202 challenge | 🔴 IP-gated |
| `seattle-childrens-museum` | browserbase | 202 challenge | 403 | 202 challenge | 🔴 IP-gated |
| `woodland-park-zoo` | browserbase | 403 | 403 | — | 🔴 IP-gated |
| `langston` | browserbase | 403 | 403 | 202 challenge | 🔴 IP-gated |
| `early-music-seattle` | browserbase | 202 challenge | challenge | 202 challenge | 🔴 IP-gated |
| `hugo-house` | browserbase | 403 | 403 | download-err | 🔴 IP-gated |
| `populus-seattle` | browserbase | **200 ICS(19)** | 200 ICS | — | ✅ works direct |
| `impact-raves` | outofband | 403 challenge | challenge | download-err | 🔴 IP-gated |
| `seattle-dsa` | outofband | 403 challenge | challenge | download-err | 🔴 IP-gated |
| `worksource-north-seattle` | outofband | 403 | 403 | — | 🔴 IP-gated |
| `worksource-downtown-seattle` | outofband | 403 | 403 | — | 🔴 IP-gated |
| `seattle-city-of-lit` | outofband | **200 ICS(150)** | 200 ICS | — | ✅ works direct |
| `go-latin-dance-seattle` | outofband | **200 ICS(30)** | 200 ICS | — | ✅ works direct |
| `united-indians-daybreak-star` | outofband | **200 ICS(16)** | 200 ICS | — | ✅ works direct |
| `wayward-music` | outofband (ripper) | **200 HTML** | 200 HTML | — | ✅ works direct |
| `flying-lion-brewing` | outofband (ripper) | **200 HTML** | 200 HTML | — | ✅ works direct |

`challenge` = sgcaptcha JS wall (`202`/`403` with the reload page); `download-err`
= crawl4ai's browser aborted navigating at a raw `.ics` ("Download is starting").
"—" = not in that probe's subset.

### Interpretation

- **Browser rescues: 0.** Every source that plain fetch couldn't get, the
  browser (vanilla *and* crawl4ai stealth) also couldn't get, with the identical
  verdict. The challenge is re-served to the GHA IP after the JS runs → the gate
  is IP reputation, not "can you execute JS."
- **crawl4ai stealth added nothing over vanilla Chromium** for these — same
  `202` sgcaptcha wall. Stealth spoofing doesn't beat an IP-reputation block.
- **The raw-ICS problem is real:** navigating a browser at a `text/calendar` URL
  triggers a download crawl4ai can't capture. Any browser-based ICS fetch must
  clear the wall in a page context and then **replay the clearance cookie** in a
  plain request — naive navigation is not enough.

## Why the original "crawl4ai before outofband" plan is dropped

The proposed ladder was `false → crawl4ai(CI) → outofband → browserbase`, on the
theory that some sources are JS-gated-only and would clear in CI with a browser.
The probe shows that theory is **empirically false for our current source set**:
the JS-challenge sources are all *also* IP-gated on the GHA range. A CI-side
browser rung has no sources to serve, so it is not worth its cost (a ~2 GB
crawl4ai service container, or an in-process browser, on the hot main-build
path). **Not implemented.**

## Where crawl4ai could still help (the deferred residential test)

crawl4ai's distinguishing property is **a non-GHA IP *and* JS execution** — but
that only exists when it runs on the **residential out-of-band runner**, not in
CI. From a residential IP:

- sgcaptcha's IP-reputation gate is satisfied (residential IPs pass), and
- the browser executes the JS challenge,

so crawl4ai could plausibly do what **`browserbase`** does today — but
**self-hosted and free**, removing the metered third-party dependency (and its
`402`-takes-down-everything failure mode). That is exactly the *"test from
residential IP to see what can skip browserbase"* phase.

**This has not been tested** (the residential runner isn't reachable from CI or
the dev sandbox). If pursued, the shape would be:

- crawl4ai runs on the residential runner; `proxy: "crawl4ai"` sources are
  fetched there by `scripts/generate-outofband.ts` (reusing all existing
  S3/report/counter plumbing), **not** live in CI.
- For ICS feeds, use **clear-then-cookie-replay** (browser clears the wall,
  harvest the clearance cookie, plain-fetch the `.ics`) to dodge the
  download-on-navigate problem confirmed above.
- Ladder becomes `false → outofband → crawl4ai(residential) → browserbase`,
  with crawl4ai as the free JS-capable residential rung ahead of the paid
  managed one. (Schema/`proxy-fetch`/counter changes as sketched in this repo's
  git history for this branch — deferred until the residential test proves it.)

## Bonus finding: possibly over-proxied sources

Six sources returned clean, valid content **directly from the GHA IP in both
probe runs**:

| Source | Current proxy | From GHA IP |
|---|---|---|
| `populus-seattle` | browserbase | 200 ICS (19 events) |
| `seattle-city-of-lit` | outofband | 200 ICS (150 events) |
| `go-latin-dance-seattle` | outofband | 200 ICS (30 events) |
| `united-indians-daybreak-star` | outofband | 200 ICS (16 events) |
| `wayward-music` | outofband (ripper) | 200 HTML |
| `flying-lion-brewing` | outofband (ripper) | 200 HTML |

These *may* be reachable directly and no longer need a proxy. **But do not flip
them blind:** they carry a proxy because they failed from CI historically, and
SiteGround/WAF blocks are intermittent (`populus` is SiteGround-family and could
re-block under real build load). Verify direct reachability over several
consecutive main builds before dropping the proxy on any of them.

## Probe tooling (reproducible)

The two probes are retained as on-demand `workflow_dispatch` diagnostics so the
findings can be re-verified (and the `.mjs` probe reused from the residential
runner for the deferred test):

- `scripts/probe-proxy-sources.mjs` + `.github/workflows/crawl4ai-probe.yml`
- `scripts/probe-crawl4ai.py` + `.github/workflows/crawl4ai-stealth-probe.yml`

They are temporary; remove once the residential-rung decision is settled.
