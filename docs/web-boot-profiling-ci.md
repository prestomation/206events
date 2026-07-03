# Boot-Interactivity Profiling in CI — Implementation Plan

**Status: plan — not yet implemented.**

A per-PR main-thread profiling job with a trend comment, modeled on the
existing Lighthouse pipeline (`docs/web-performance-measurement-impl.md`).
It measures the thing Lighthouse structurally cannot: **what happens to the
main thread in the seconds *after* first paint**, when the full
`events-index.json` replaces the "soon" subset and the app re-renders over the
whole corpus.

## Why Lighthouse isn't enough

PR #835 fixed a multi-second input freeze that users hit right after the
splash dismissed. Lighthouse *did* see part of it (TBT 3534 ms on the main
baseline, per the Lighthouse trend comment on #835), but:

- Lighthouse's audit window is the initial load. The full-index swap lands on
  a **network-timing-dependent schedule** — on a fast connection it can fall
  outside the audited window entirely, and Lighthouse never simulates the
  user *tapping mid-swap*, which was the actual reported symptom.
- Lighthouse's INP is lab-null (no interaction script). The metric that
  regressed — tap-to-response while the index lands — is invisible to it.
- TBT conflates boot-time JS with the swap block. A regression in one can
  hide an improvement in the other.

The diagnosis harness built for #835 (Playwright + CDP throttling + long-task
observer + a deliberately delayed index response + a mid-swap tap) caught the
freeze precisely and verified the fix. This plan productionizes that harness.

## What gets measured

One Playwright/Chromium session per run: **mobile viewport (390×844), 4× CDP
CPU throttle** (mid-range-phone stand-in), `PerformanceObserver` for long
tasks injected before any page script, and the context created with
**`serviceWorkers: 'block'`**. Blocking the SW is load-bearing, not hygiene:
`web/src/sw.js` precaches `events-index.json` on install and serves it
stale-while-revalidate, and SW-originated fetches are invisible to Playwright
route interception — with the SW active, whether the delay below applies
becomes a race between SW activation and the phase-2 fetch. (The e2e suite
blocks it for the same reason — see `web/playwright.config.js`.) The harness
intercepts `**/events-index.json` and delays the response by **2.5 s** so the
splash always dismisses on the soon payload first — pinning the production
ordering regardless of network speed — then taps the **Following** bottom tab
500 ms after the splash detaches.

Reported metrics (all lower-is-better, medians over `--runs`, default 3):

| Key | Metric | What it catches | Noise band |
|---|---|---|---|
| `worstTask` | Longest main-thread task through settle (ms) | any single giant block (the #835 failure mode) | ±150 ms |
| `totalBlock` | Sum of long-task time through settle (ms) | death-by-a-thousand-cuts regressions | ±300 ms |
| `swapBlock` | Longest task starting after the events-index response (ms) | regressions specific to the soon→full swap | ±150 ms |
| `tapResponse` | Tap → nav-state painted (ms), tapped mid-swap | the user-reported symptom, directly | ±100 ms |
| `splashTime` | Navigation → splash detached (ms) | boot-path regressions | ±300 ms |

"Settle" = 12 s after the full-index response (enough for the swap render and
follow-on effects at 4× throttle; tunable).

## Architecture (mirrors Lighthouse exactly)

```
scripts/boot-profile-report.mjs        pure: metrics -> markdown (unit-tested)
web/scripts/boot-profile.mjs           the harness: URL in, metrics JSON out
.github/workflows/pr-preview.yml       new `boot-profile` job (PR side)
.github/workflows/web-boot-profile-baseline.yml   main-side baseline recorder
```

### 1. The harness — `web/scripts/boot-profile.mjs`

Lives under `web/` so it can `import { chromium } from '@playwright/test'`
(the one Playwright package `web/package.json` declares; `playwright-core`
is only a transitive dep and must not be imported directly). The job installs
its own browser — CI jobs don't share disk with the e2e workflow. CLI:

```
node scripts/boot-profile.mjs <url> [--runs 3] [--cpu 4] [--out metrics.json]
```

Per run: fresh browser context → init scripts (long-task observer, FTUX flag
pre-set so the welcome modal doesn't intercept the tap) → route-delay
`events-index.json` → navigate → wait splash detached → wait 500 ms → tap
Following → wait nav-active + double-rAF → wait settle → collect. Output is
`{ metrics: { worstTask, totalBlock, swapBlock, tapResponse, splashTime },
runs: [...], meta: { url, cpu, runs } }` with each metric the **median**
across runs. Non-2xx page load or a missing splash/nav selector fails the
run loudly (a broken harness must not report a green-looking 0).

### 2. The report module — `scripts/boot-profile-report.mjs`

Same shape as `scripts/lighthouse-report.mjs`: a `METRICS` table (key, label,
unit, `lowerIsBetter: true`, noise band), `COMMENT_MARKER =
'boot-profile-trend'`, `parseEmbeddedTrend`, `buildComment` producing the
table with **vs prev push** (embedded base64 trend state in the comment, max
8 history entries) and **vs main baseline** columns, 🟢/🔴/≈ indicators.

The generic machinery (embedded-trend parse/serialize, delta table renderer)
is ~120 lines duplicated from `lighthouse-report.mjs`. **Option A (default):**
copy the pattern — two small independent files, zero refactor risk.
**Option B:** extract a shared `scripts/trend-comment.mjs` both modules
parameterize with their `METRICS` + marker; do this only if the reviewer
prefers it, as it touches the shipped Lighthouse path. Unit tests either way
(`scripts/boot-profile-report.test.mjs`, mirroring the Lighthouse tests).

### 3. PR-side job — `boot-profile` in `pr-preview.yml`

- `needs: deploy-preview`, gated on a deployment URL — profiles the **real
  deployed preview** with the PR's real data, exactly like the Lighthouse job
  two entries above it. Route interception works fine against a remote URL.
- Steps: checkout → setup-node → `cd web && npm ci` →
  `npx playwright install chromium --with-deps` →
  `node scripts/boot-profile.mjs <preview-url> --runs 3 --out ../boot-profile/metrics.json`
  → restore `boot-profile-baseline-v1-` from the Actions cache (prefix
  restore-key) → `actions/github-script` upserts the comment via the report
  module. `permissions: { contents: read, pull-requests: write }` — both,
  matching the lighthouse job; `pull-requests: write` alone would replace the
  default set and break the job's own checkout.
- **Warn-only**, like Lighthouse: the job never fails the PR on a regression
  (a step summary `::warning::` when a metric exceeds 2× baseline is cheap
  and worth adding). Gating budgets are a later decision once a few weeks of
  trend data show the real noise floor.
- Runtime budget: ~3 runs × ~35 s + install ≈ **4–5 min**, parallel to the
  existing lighthouse job so PR wall-clock is unchanged.

### 4. Main baseline — `web-boot-profile-baseline.yml`

Clone of `web-lighthouse-baseline.yml`: on push to `main` touching `web/**`
(or the harness/workflow files), run the same harness against
**https://206.events**, write `{ metrics, sha, ts }` to
`boot-profile-baseline/metrics.json`, save to the Actions cache with the
rotating `boot-profile-baseline-v1-${run_id}` key. Baseline failures fail
loudly; an absent/cold cache just drops the "vs main" column on PRs.

## Noise control

- 4× throttle makes the measured blocks large relative to runner jitter;
  medians-of-3 plus the per-metric ≈ bands absorb the rest. If trend data
  shows flapping, first bump `--runs` to 5, then widen bands — same knobs
  Lighthouse uses.
- The corpus grows over time, so absolute numbers drift upward — that drift
  is *signal* (it's exactly how the #835 block grew), and the vs-prev-push
  column is same-day/same-corpus so PR deltas stay clean. A deterministic
  synthetic 12k-event fixture was considered and rejected for v1: it
  diverges from what users load, misses payload-shape changes, and the
  Lighthouse pipeline already accepts (and benefits from) live-data drift.

## Rollout

1. **PR 1 (this plan)** — human review of the approach. Open questions to
   settle in review: Option A vs B on the report module; whether `tapResponse`
   should tap Following (cheap view) or Map (heavier, but conflates Leaflet
   init); runs=3 vs 5.
2. **PR 2 (implementation)** — harness + report module + tests + both
   workflow changes + a "shipped" update to this doc and
   `docs/web-performance-plan.md` Part 2. New CI infrastructure →
   **manual merge**.
3. After ~2 weeks of trend comments, revisit: tighten noise bands, consider
   a step-summary warning threshold, consider gating only `worstTask`.

## Risks / limitations

- **Chromium-only** (CDP throttling); fine — this is a lab trend, not
  compat coverage.
- **The harness runs SW-less** (`serviceWorkers: 'block'`, above), so it
  measures the cold, network-served path — deliberately, since that's the
  deterministic one. If the service-worker caching strategy changes (e.g.
  the precache list or stale-while-revalidate behavior), the harness
  assumption should be revisited alongside it.
- **Fork PRs**: same posture as the lighthouse job — without the Cloudflare
  secrets there's no `deployment-url`, so the job is skipped; and a fork's
  read-only `GITHUB_TOKEN` couldn't upsert the comment anyway.
- **Preview ≠ production CDN** (Cloudflare Pages preview vs prod), but both
  columns compare like-to-like (preview↔preview for prev-push,
  prod↔prod-measured-baseline for vs-main is *not* like-to-like — accepted,
  same asymmetry the Lighthouse pipeline has, and the ≈ bands plus the
  trend column carry the real signal).
- The 2.5 s index delay is synthetic choreography. That's deliberate: it
  makes the race deterministic instead of runner-network-dependent. If the
  app's loading phases change shape (e.g. the soon payload is removed), the
  harness selectors and delay need revisiting — the harness fails loudly in
  that case rather than reporting stale semantics.
