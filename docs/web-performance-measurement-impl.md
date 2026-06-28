# Implementation Plan — Web Vitals RUM + Lighthouse CI

A code-level implementation plan for two of the measurement layers proposed in
[`web-performance-plan.md`](./web-performance-plan.md): **field telemetry
(Real-User Monitoring via Core Web Vitals)** and **Lighthouse in CI**. This
drills from "what" to "exactly which files, deps, and config."

Both are **new infrastructure** → manual-merge per the AGENTS.md auto-merge
table, and the RUM piece touches `web/src/**` + the privacy posture, so it ships
with a test and a `docs/privacy-and-consent.md` update in the same PR.

These are independent and can land as **two separate PRs**. RUM is the smaller,
higher-signal one (it measures the metric the user actually complained about —
INP); Lighthouse is a lab gate. Recommended order: RUM first.

---

## A. Web Vitals RUM via GoatCounter

### A.0 The constraint that shapes everything

`docs/privacy-and-consent.md` forbids a consent banner, which means telemetry
**must be cookieless and non-identifying** and **must not add a third-party
tracker**. So:

- We do **not** add a RUM SaaS (SpeedCurve, Datadog RUM, GA, etc.) — any of
  those would require a banner.
- We reuse **GoatCounter**, which the site already loads (`city.config.ts` →
  `analytics.goatcounterCode: "seattle-calendars"`), is cookieless, and is
  already consent-exempt.
- We report **bucketed ratings** (`good` / `needs-improvement` / `poor`), never
  raw per-visitor timings, so nothing is individually identifying.

**Two data planes, never joined.** The site has an authenticated plane (the
favorites-worker: `session` JWT + Google identity) and an analytics plane
(GoatCounter + Web Vitals). Login stitches the *authenticated* plane — that's
inherent to login, and its cookie is strictly necessary/exempt — but it must
**not** stitch the analytics plane: a beacon never carries the logged-in identity
(no user id / email / `listId`) and is never routed through the authenticated
worker, so a signed-in user's beacon is identical to an anonymous one. The one
discipline that preserves "non-identifying": **never enrich a beacon with
identity for segmentation.**

GoatCounter is **count-only** — it records a hit against a path string, with no
numeric payload. So the metric *value* must be encoded into the path (the
bucket), and we accept that we get **rating distributions, not percentiles**.
Percentiles are out of scope here — but note the blocker is **technical, not
privacy**: GoatCounter can't store a number. True p75 distributions would need a
numeric sink, and a **first-party, unauthenticated** collector that stores
`{metric, value, timestamp}` with no identity stays banner-free under the same
cookieless/non-identifying rules. The rating buckets are also the official CWV
p75 thresholds, so for trend-tracking they're usually sufficient anyway.

### A.1 Dependency

Add [`web-vitals`](https://github.com/GoogleChrome/web-vitals) (~2 KB gzip, no
network of its own) to **`web/package.json`**:

```jsonc
"dependencies": {
  "web-vitals": "^4.2.4",   // pin to the v4 attribution-free build
  …
}
```

It must go in `web/` (the bundle's package.json), not the root. Use the standard
`web-vitals` entry, not `web-vitals/attribution` — attribution adds bytes we
don't need for bucketed reporting.

### A.2 The reporter module — `web/src/lib/webVitals.js`

A single self-contained module. Responsibilities: collect the metrics, bucket
them, and forward to GoatCounter — but only in prod, and only once GoatCounter
has actually loaded.

```js
// web/src/lib/webVitals.js
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals'

// Same prod-only guard the GoatCounter loader uses (vite.config.js): never
// report from localhost or a /preview/ deploy, so PR previews and local dev
// don't pollute the field data.
function isReportingEnv() {
  if (typeof window === 'undefined') return false
  const blocked = ['localhost', '127.0.0.1', 'htmlpreview.github.io']
  const isPreview = window.location.pathname.indexOf('/preview/') !== -1
  // Cloudflare Pages preview deploys are *.pages.dev — also exclude those.
  const isPagesPreview = /\.pages\.dev$/.test(window.location.hostname)
  return !blocked.includes(window.location.hostname) && !isPreview && !isPagesPreview
}

// web-vitals already exposes the official rating; fall back defensively.
function bucket(metric) {
  return metric.rating || 'unknown'   // 'good' | 'needs-improvement' | 'poor'
}

// GoatCounter's count.js loads async and may not be present yet (or ever, if
// blocked). Queue beacons and flush when window.goatcounter.count exists.
const queue = []
let flushing = false
function flush() {
  if (flushing) return
  if (!window.goatcounter || !window.goatcounter.count) return
  flushing = true
  while (queue.length) {
    const path = queue.shift()
    try { window.goatcounter.count({ path, title: 'web-vital', event: true }) } catch {}
  }
  flushing = false
}
function report(metric) {
  // e.g. "vitals/INP/poor" — 5 metrics × ~3 buckets = ~15 distinct paths total.
  queue.push(`vitals/${metric.name}/${bucket(metric)}`)
  flush()
  // GoatCounter may finish loading after the first metric; retry-flush a few
  // times. web-vitals fires most finals at visibility-hidden, by which point
  // count.js is long since loaded, so this is just belt-and-suspenders.
  if (queue.length) setTimeout(flush, 2000)
}

export function initWebVitals() {
  if (!isReportingEnv()) return
  // Each callback fires once with the final value (INP/CLS settle at
  // visibility-hidden; LCP at the first interaction or hide). No double-count.
  onLCP(report); onINP(report); onCLS(report); onFCP(report); onTTFB(report)
}
```

Notes:
- **INP is the headline metric** — it's the one that captures "typing/tapping
  feels slow," which is the user's actual complaint. LCP/FCP/TTFB/CLS are
  collected too because they're free once `web-vitals` is in.
- **Cardinality is tiny** (~15 paths), so this won't blow up GoatCounter's path
  list or its free-tier limits.
- **Sampling knob:** for a community-scale site, volume is low — send 100%. If
  it ever needs sampling, gate `report()` on `Math.random() < SAMPLE_RATE`. (Do
  not use a persisted per-user sampling decision — that would need storage and
  edges toward identifying.)

### A.3 Wiring it in — `web/src/main.jsx`

Register after the app mounts and the service worker registers, so vitals
collection never competes with first paint:

```js
import { initWebVitals } from './lib/webVitals.js'
// …after ReactDOM.createRoot(...).render(...) and the SW registration block:
initWebVitals()
```

That's the entire app-side change — no UI, no new render path.

### A.4 Test — `web/src/lib/webVitals.test.js` (Vitest)

There's no visible UI, so this is a **unit test**, not a Playwright/screenshot
change (the AGENTS UI-change rule about e2e + screenshots targets visual
changes; this has none — call that out in the PR body).

Cover:
1. **Prod-only guard.** With `window.location.hostname = 'localhost'` (and a
   `.pages.dev` host, and a `/preview/` path), `initWebVitals()` reports nothing.
2. **Happy path.** Mock the `web-vitals` module so each `onX` callback is
   invoked with a fake `{ name, rating }`; assert `window.goatcounter.count` is
   called with `path: 'vitals/INP/poor'` etc.
3. **GoatCounter absent.** With `window.goatcounter` undefined, `report()`
   queues without throwing; after setting `window.goatcounter.count` and
   re-flushing, the queued beacons fire (validates the deferred-flush queue).
4. **Bucketing.** A metric with `rating: 'good'` produces the `…/good` path.

Mock `web-vitals` with `vi.mock('web-vitals', () => ({ onLCP: fn, … }))` so no
real measurement runs in jsdom.

### A.5 Privacy doc update (same PR)

Per the repo's "document privacy posture in the same PR" rule, add a short
section to `docs/privacy-and-consent.md`:

- **What:** Core Web Vitals (LCP, INP, CLS, FCP, TTFB) collected client-side via
  the `web-vitals` library.
- **How reported:** as **bucketed** GoatCounter custom events
  (`vitals/<metric>/<rating>`) — cookieless, no fingerprinting, no raw
  per-visitor values, no third-party request beyond the GoatCounter beacon the
  site already sends. Still consent-exempt; **no banner needed**.
- **Why it doesn't cross a line:** ratings are aggregate buckets, not
  identifying data; this rides the existing analytics channel rather than adding
  a tracker.
- **Two planes, never joined:** the authenticated favorites-worker plane (session
  JWT + identity) stays separate from the analytics plane — beacons never carry
  the logged-in identity, so login doesn't make the telemetry identifying.

This was implemented in `docs/privacy-and-consent.md` (inventory row + a
"Web Vitals RUM: bucketed, and on a separate plane from login" section).

### A.6 What you get

A trend line in the GoatCounter dashboard of the **share of sessions in
good/needs-improvement/poor** for each metric over time — visible per the same
segments GoatCounter already records (path, referrer, etc.). When O-4 / N-1 /
N-2 land, the `poor` share of INP/LCP should shrink, and you'll see it in the
field rather than inferring it from a lab number.

---

## B. Lighthouse in CI

### B.1 Where it runs: against the existing Cloudflare preview

`pr-preview.yml` already builds the calendars and deploys the bundle to
Cloudflare Pages, exposing the URL as the `deploy-preview` job output
`deployment-url` (e.g. `https://pr-743.206events.pages.dev`). Running Lighthouse
against **that** URL is the right call over a local `vite preview`, because:

- it exercises the **real CDN + Brotli + prod-like build** with **real data**
  (the local e2e harness mocks all data fetches, which would give Lighthouse an
  unrealistically empty page), and
- it requires no second build.

The cost: it depends on the CF preview existing (template copies without CF
secrets won't have a URL), and hosted-runner Lighthouse is **noisy** — so we run
it as an **informational gate** (warn, median-of-3), not a hard blocker, until a
stable baseline justifies hardening.

### B.2 Add a `lighthouse` job to `pr-preview.yml`

Append a job that runs after `deploy-preview`, **skipped when there's no preview
URL** (so template copies and failed deploys don't fail this job):

```yaml
  lighthouse:
    runs-on: ubuntu-latest
    needs: deploy-preview
    if: needs.deploy-preview.outputs.deployment-url != ''
    permissions:
      contents: read
      pull-requests: write   # to post/update the LH comment
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v12
        with:
          urls: ${{ needs.deploy-preview.outputs.deployment-url }}
          configPath: ./web/lighthouserc.json
          uploadArtifacts: true              # raw LH reports as a workflow artifact
          temporaryPublicStorage: true       # gives a shareable report URL per run
        env:
          # Give the SPA + heavy index a moment before LH starts measuring.
          LHCI_BUILD_CONTEXT__CURRENT_HASH: ${{ github.event.pull_request.head.sha }}
```

Trigger note: `pr-preview.yml` already runs on every PR. Lighthouse only matters
for `web/**` changes, but since it's `needs: deploy-preview` it piggybacks on the
preview that's built anyway; if that's too heavy, gate the job with a
`paths`-filtered separate workflow instead (mirror `web-e2e.yml`'s `paths`).

### B.3 Config — `web/lighthouserc.json`

```jsonc
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,                 // median of 3 to damp hosted-runner noise
      "settings": {
        "preset": "desktop"              // OMIT for the default mobile preset…
        // …mobile (the default) is the right target — the complaints are mobile.
        // Start with mobile; the line above is shown only to note the knob.
      }
    },
    "assert": {
      "assertions": {
        // Start everything as WARN — collect a baseline before gating. Promote
        // to "error" once the numbers are stable and a regression budget is set.
        "categories:performance":        ["warn", { "minScore": 0.8 }],
        "largest-contentful-paint":      ["warn", { "maxNumericValue": 3000 }],
        "interaction-to-next-paint":     ["warn", { "maxNumericValue": 300 }],
        "total-blocking-time":           ["warn", { "maxNumericValue": 400 }],
        "cumulative-layout-shift":       ["warn", { "maxNumericValue": 0.1 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

- **Mobile preset (default)** with Lighthouse's standard CPU/network throttling
  is the realistic target — it's where the sluggishness was reported. Keep it.
- **TBT** is the lab proxy for the field's **INP**; it's the assertion most
  likely to catch a regression from the heavy Fuse/parse work, so it's the one
  to watch as those optimizations land.
- All assertions start as **`warn`** so the job is informational. Once a few PRs
  establish a stable baseline, flip the load-bearing ones (`performance`, `TBT`,
  `LCP`) to `error` with budgets set just above the baseline so only
  *regressions* fail.

### B.4 Optional: fold in the Layer-1 byte budget via `budget.json`

Lighthouse can enforce a **performance budget** (script/total transfer bytes)
natively — this is a clean way to implement the "bundle budget" from Layer 1 of
the main plan and keep the N-1/N-2/N-3 lazy-loading wins from eroding. Add a
`budgets` array to the collect settings or a separate `web/budget.json`:

```jsonc
[{
  "path": "/*",
  "resourceSizes": [
    { "resourceType": "script", "budget": 350 },   // KB; entry+vendor after splitting
    { "resourceType": "total",  "budget": 1500 }
  ]
}]
```

A breach surfaces in the LH report's "Performance budget" audit. (If you'd
rather gate bytes deterministically without LH noise, keep this in the dedicated
Layer-1 CI check instead — but LH makes it free here.)

### B.5 Trend reporting (implemented): a PR comment with two comparisons

The job posts/updates a **single** `## 🔦 Lighthouse` PR comment (find-or-update,
mirroring the Calendar Preview comment so there's no per-run spam) with a table
of the scores and **two** delta columns:

| Metric | This PR | vs prev push | Main baseline | vs main |
|---|---|---|---|---|
| Performance | 82 | +2 🟢 | 85 | −3 🔴 |
| LCP | 2.9 s | −0.20 s 🟢 | 2.5 s | +0.4 s 🔴 |
| … | | | | |

- **vs prev push** — the previous run *on this PR*, stored in the comment itself
  as a hidden `<!-- lighthouse-trend:{…} -->` payload (current run + a small
  recent-run history). No external state; each push reads its own prior comment,
  computes deltas, and rewrites — plus a one-line Performance sparkline
  (`77 → 79 → 80 → 82`) over the PR's runs.
- **vs main** — the last scores recorded on `main`, restored from the Actions
  cache (below). Absent on a cold cache → the column shows "—" and a "not
  recorded yet" note.

🟢 = better, 🔴 = worse, **≈ = within noise** (a per-metric threshold — 1 perf
point, 100 ms LCP/FCP, 50 ms TBT, 30 ms INP, 0.01 CLS — so hosted-runner jitter
doesn't read as a regression).

The pure logic (metric extraction, direction-aware deltas, table/markdown,
embed/parse round-trip) lives in **`scripts/lighthouse-report.mjs`** and is
unit-tested in `scripts/lighthouse-report.test.mjs`; the workflow step is a thin
github-script that reads the LHCI results, calls the module, and upserts the
comment.

### B.6 Main baseline (implemented): cache, not commit-back

**`.github/workflows/web-lighthouse-baseline.yml`** runs Lighthouse against
**production** (`https://206.events`) on every push to `main` touching `web/**`,
extracts the representative metrics with the same `scripts/lighthouse-report.mjs`
helper, and saves `{metrics, sha, ts}` to the GitHub Actions cache under a
rotating key (`lighthouse-baseline-v1-<run_id>`). The PR job restores it via the
`lighthouse-baseline-v1-` prefix restore-key (newest wins).

This deliberately uses the **Actions cache rather than a committed baseline
file**: it avoids a CI commit-back to `main` (and the trigger-loop risk that
brings), and caches created on the default branch are readable from PR runs. The
tradeoff is eviction (7-day idle / repo cache pressure) — handled gracefully by
the "no baseline yet" state. If a durable, versioned history is later wanted, the
escalation path is appending an NDJSON row to a committed file from this same
main job, or an LHCI server; both are overkill for now.

---

## Sequencing & ownership

| Order | Change | Surface | Risk | Merge |
|---|---|---|---|---|
| 1 | RUM module + `main.jsx` wire-in + unit test + privacy doc | `web/src`, docs | low | manual (infra + privacy) |
| 2 | `lighthouserc.json` + `lighthouse` job (warn-only) on previews | CI | low | manual (infra) |
| 3 | LH byte budget (`budget.json`) | CI config | low | manual |
| 4 | `main`-branch trend (step summary / NDJSON history) | CI | low | manual |
| 5 | Promote LH assertions warn → error once baseline is stable | CI config | med | manual |

RUM (1) is the highest-signal, smallest change and should go first — it measures
INP, the exact thing users feel. Lighthouse (2–5) is the lab complement: it
catches regressions pre-merge, where RUM only sees them post-deploy. Together,
the lab gate prevents regressions and the field telemetry confirms whether the
fixes actually helped real devices.
