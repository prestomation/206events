# Boot-Interactivity Profiling in CI — Implementation Plan

**Status: implemented** (same PR as this plan; see the harness, report
modules, and workflow wiring referenced below).

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
| `tapResponse` | Tap Following → nav-state painted (ms), tapped mid-swap | the user-reported symptom, directly | ±100 ms |
| `splashTime` | Navigation → splash detached (ms) | boot-path regressions | ±300 ms |
| `mapOpen` | Tap Map (post-settle, first open) → Leaflet container painted (ms) | map chunk load + Leaflet init + marker pipeline over the full corpus | ±200 ms |
| `mapReopen` | Tap Map a second time (after leaving the tab) → Leaflet painted (ms) | the recurring per-visit cost: leaving the tab unmounts Leaflet, so every re-entry pays init + marker pipeline again, chunk already cached | ±200 ms |
| `youOpen` | Tap You from Discover (post-settle) → You heading painted (ms) | full-view teardown/mount on tab switch + the shell-wide re-render every section change causes | ±150 ms |
| `personalizedSettle` | Sum of long-task time through settle with **seeded personalization** (ms) | main-thread cost that only exists for a logged-in profile — the saved-search matching storm (docs/following-tab-performance.md) | ±300 ms |
| `followingOpen` | Tap Following from Discover (post-settle, **seeded**) → Following heading painted (ms) | entering the tab with a populated feed: feed render + (desktop-class) shell re-render | ±150 ms |

"Settle" = 12 s after the full-index response (enough for the swap render and
follow-on effects at 4× throttle; tunable).

The last two run in a **second pass per run** with a representative
logged-in profile seeded into the app's own localStorage keys before boot
(35 followed calendars pulled live from the deployment's `manifest.json`,
14 saved searches, 1 geo filter — see `SEED_*` in the harness). The
anonymous localStorage path exercises the identical
`perFilterMatches`/`followingGroups` code as a signed-in list, so no auth
is needed in the lab. All the anonymous-pass metrics keep their original
meaning; `personalizedSettle` is `totalBlock`'s methodology re-measured
under the seeded profile, so their gap isolates what personalization costs.

The taps are deliberately split so each metric has one owner when it
moves: `tapResponse` taps **Following** mid-swap — a cheap empty-feed view,
so it isolates "did the app yield to input during the swap render" (the
regression class the `startTransition` fix addresses). `mapOpen` taps **Map**
only after settle, when the corpus is deterministically the full index, so it
cleanly captures the lazy-chunk + Leaflet-init + marker-pipeline cost without
racing the swap. Tapping Map mid-swap instead was considered and rejected:
it conflates four causes (swap block, chunk fetch over CI network, Leaflet
init, marker build) into one number that can't tell you what regressed.

The post-settle tab-switch pair (`mapReopen`, `youOpen`) measures the
steady-state click experience — the user-reported "clicking You or the Map
is quite slow once the page is loaded" symptom. `mapReopen` re-opens the Map
tab after leaving it: the content area is keyed by section, so the re-entry
pays Leaflet init + the marker pipeline again with the chunk cache warm —
exactly the cost a keep-the-map-mounted fix would eliminate. `youOpen` taps
You from Discover: it owns the synchronous teardown of the heaviest list view
plus the You mount and the shell-wide re-render a section change triggers.
It anchors on the You view's *heading* (not the nav active-state) so the
metric keeps tracking the view swap even after section navigation becomes a
`startTransition` and the nav highlight starts painting first.
Each measured tap starts from a quiet main thread (post-transition paint +
500 ms pause) so it owns only its own transition. See
`docs/web-tab-switch-performance.md` for the improvement plan these two
metrics are designed to verify.

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
                                    [--index-delay 2500] [--settle 12000]
```

Per run: fresh browser context → init scripts (long-task observer, FTUX flag
pre-set so the welcome modal doesn't intercept the tap) → route-delay
`events-index.json` → navigate → wait splash detached → wait 500 ms → tap
Following → wait nav-active + double-rAF → wait settle → collect → open the
Map tab via Discover → back to Discover and re-open Map → back to Discover
and open You. A second, personalization-seeded pass then boots a fresh
context with the seed profile in localStorage and measures
`personalizedSettle` + `followingOpen`. Output is `{ metrics: { worstTask,
totalBlock, swapBlock, tapResponse, splashTime, mapOpen, mapReopen, youOpen,
personalizedSettle, followingOpen }, runs: [...], meta:
{ url, cpu, runs, indexDelayMs, settleMs } }` with each metric the
**median** across runs. A non-2xx page load or a missing splash/nav selector fails the run
loudly (a broken harness must not report a green-looking 0). Tap latency is
stamped from Node wall-clock anchored to the page's constant
`performance.timeOrigin` — an in-page timestamp (or a sampled
`performance.now()` offset) would queue behind the very main-thread block
being measured and bias the metric low.

### 2. The report module — `scripts/boot-profile-report.mjs`

Same shape as `scripts/lighthouse-report.mjs`: a `METRICS` table (key, label,
unit, `lowerIsBetter: true`, noise band), `COMMENT_MARKER =
'boot-profile-trend'`, `parseEmbeddedTrend`, `buildComment` producing the
table with **vs prev push** (embedded base64 trend state in the comment, max
8 history entries) and **vs main baseline** columns, 🟢/🔴/≈ indicators.

The generic machinery (embedded-trend parse/serialize, delta table renderer)
is ~120 lines shared with `lighthouse-report.mjs`. **Decided: extract it**
into a shared `scripts/trend-comment.mjs` that both report modules
parameterize with their `METRICS` table and comment marker. The extraction
refactors the shipped Lighthouse path, so the implementation PR must keep
`scripts/lighthouse-report.test.mjs` green unchanged — those existing tests
are the proof the refactor didn't alter the Lighthouse comment — and add
`scripts/boot-profile-report.test.mjs` for the new module.

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
- Runtime budget: ~3 runs × ~50 s + install ≈ **5–6 min** (the post-settle
  tab-switch phase — a second Leaflet boot at 4× throttle plus two reset
  round-trips and their 500 ms guards — added roughly 15 s per run), still
  parallel to the existing lighthouse job so PR wall-clock is unchanged.

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

1. **Plan review** — done. Settled: the report modules share an extracted
   `scripts/trend-comment.mjs`; `--runs` stays at 3; the mid-swap tap
   targets Following with a separate post-settle `mapOpen` metric.
2. **Implementation** — ships in the same PR as this plan (owner approved
   the plan in-session): harness + report modules + tests + both workflow
   changes + `docs/web-performance-plan.md` Part 2 note. New CI
   infrastructure → **manual merge**.
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
