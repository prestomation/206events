# Lighthouse Performance Plan — Initial-Load Critical Path

A phased plan to raise the production Lighthouse **Performance score
(currently 53 on mobile)** by fixing the six audits it flags:

1. Forced reflow
2. Network dependency tree (avoid chaining critical requests)
3. Render-blocking requests
4. Eliminate render-blocking resources
5. Reduce unused CSS
6. Reduce unused JavaScript

## How this relates to prior perf work

[`web-performance-plan.md`](./web-performance-plan.md) attacked **post-load
main-thread CPU** (the "typing/tapping feels slow" complaint): lazy map, lazy
ical.js, vendor chunking, search Worker, the full-index `startTransition`
swap. Those shipped and worked — long-task time at 4× throttle dropped
14.1 s → 1.9 s.

Lighthouse measures a different window: the **initial-load critical path** —
what blocks first paint, how deep the request chain to first content is, and
how many bytes are parsed that the first screen never uses. That window is
what this plan addresses. Nothing here re-opens the shipped work; every item
below is additive.

Current production build shape (from `vite build`, gzip sizes):

| Asset | Raw | Gzip | Loaded |
|---|---|---|---|
| `index-*.js` (entry) | 187 KB | 57 KB | eager, blocks interactivity |
| `vendor-*.js` (react, react-dom, fuse.js, dompurify) | 182 KB | 61 KB | eager (modulepreload) |
| `index-*.css` | 97 KB | 17 KB | **render-blocking** |
| 9 × woff2 fonts | ~208 KB total | — | post-CSS, `font-display: swap` |
| `EventsMap-*.js` + CSS | 220 KB | 70 KB | lazy ✅ (desktop-only mount) |
| `ical-*.js` | 81 KB | 23 KB | lazy ✅ (first channel open) |
| `searchWorker-*.js` | 21 KB | — | worker, off main thread ✅ |

---

## Phase 0 — Capture a quantified baseline (no code changes)

The screenshot names the failing audits but not their weights. Before
changing anything, capture the numbers each later phase will be judged
against:

- Run Lighthouse (mobile emulation, 3 runs) against `https://206.events` and
  save the JSON: per-audit estimated savings for the six flagged audits, plus
  LCP / TBT / CLS / FCP and the LCP element. The existing
  `web-lighthouse-baseline.yml` workflow already does exactly this on pushes
  to `main` — a `workflow_dispatch` run is enough; pull the report from its
  artifact/public-storage link.
- In Chrome DevTools against production: **Coverage** panel snapshot at first
  paint for `index-*.css` (expected: large unused fraction — see Phase 2) and
  the two eager JS chunks.
- Record which element Lighthouse picks as LCP (likely the first event-card
  image or the Discover heading). Every Phase 1 decision about what to
  preload keys off this.

Deliverable: a short `docs/lighthouse-baseline-<date>.md` table (or a section
appended to this doc) with audit → estimated ms/KB savings, so each phase's
PR can show before/after against the same numbers.

---

## Phase 1 — Flatten the critical request chain (low risk, biggest wins)

Addresses: **Network dependency tree**, **Render-blocking requests**, part of
**Reduce unused JavaScript**.

### 1a. Preload the first-paint data fetches

Today the first content render sits at the end of a 3-hop chain:

```
index.html → index-*.js (+vendor) → fetch manifest.json + events-index-soon.json (+ venues.json)
           → first cards render (LCP)
```

`manifest.json` and `events-index-soon.json` (`web/src/App.jsx` `loadIndex` /
manifest effects) are only discovered after ~118 KB gzip of JS downloads and
executes. Add to `web/index.html`:

```html
<link rel="preload" href="./events-index-soon.json" as="fetch" crossorigin="anonymous">
<link rel="preload" href="./manifest.json" as="fetch" crossorigin="anonymous">
```

so the data downloads **in parallel with** JS download/parse instead of after
it. This directly shortens the chain Lighthouse flags and should move LCP by
roughly the data-fetch RTT + transfer time on mobile.

**Verify the preload is actually consumed** (DevTools Network: no duplicate
fetch). `as="fetch"` preloads must match the eventual request's mode and
credentials — the app fetches with defaults, so `crossorigin="anonymous"` is
the required pairing on same-origin fetch() preloads. A mismatched preload is
worse than none (double download); the e2e suite should assert
single-fetch via a request-count check in a spec.

Do **not** preload `events-index.ndjson` (the full corpus) — it's
deliberately deferred behind the soon-subset paint
(`docs/event-payload-scaling.md`), and preloading it would compete with the
critical path for bandwidth.

### 1b. Preload the above-the-fold font weights

Nine woff2 files (~208 KB) are declared in CSS, so the browser discovers them
only after the render-blocking stylesheet arrives: HTML → CSS → font — another
flagged chain. `font-display: swap` (the @fontsource default) keeps them from
blocking paint, but late fonts mean a visible re-flow of the LCP text and a
longer chain.

- Preload only the weights the first screen actually renders (audit in
  DevTools; expected: `inter-latin-400`, `inter-latin-600`, and the
  `inter-tight` heading weight — 3 files ≈ 70 KB, not all nine).
- While auditing, check whether all nine imported weights in
  `web/src/index.css` are still used at all (e.g. JetBrains Mono 500). Every
  weight dropped is ~21–24 KB off the page weight. The `.woff` (non-woff2)
  fallbacks are emitted but never downloaded by modern browsers — harmless,
  ignore.

Vite doesn't know which hashed font filenames to inject, so this needs a tiny
`transformIndexHtml`/manifest step in `web/vite.config.js` (same pattern as
the existing `city-config-html` plugin) that resolves the hashed asset names
at build time.

### 1c. Stop eagerly shipping conditional UI (unused JS)

Two entry-chunk residents are behind toggles most sessions never flip:

- **`HealthDashboard`** — statically imported in `web/src/App.jsx:7`, rendered
  only when `showHealthDashboard` is set. `React.lazy` + `<Suspense>`, same
  pattern as `EventsMap` in `redesign/shell.jsx`.
- **Fuse on the main thread** — `App.jsx:2` imports `fuse.js` eagerly for the
  calendar-sidebar search (`new Fuse(...)` at `App.jsx:1134`), which pulls it
  into the eager `vendor` chunk even though event search already runs in the
  Worker. Build the sidebar Fuse lazily (dynamic `import('fuse.js')` inside
  the memo/effect that constructs it, mirroring the `ical.js` pattern), then
  **remove `fuse.js` from `manualChunks.vendor`** in `web/vite.config.js` so
  it actually leaves the eager path. Note `lib/searchEngine.js` (main-thread
  fallback when Workers are unavailable) is only reached via
  `searchClient.js`'s fallback branch — confirm it's already a dynamic import
  there; if not, make it one.
- **`dompurify`** — check where `EventDescription.jsx` first renders. If
  description HTML only appears in detail panels (not the card grid), lazy
  the sanitizer with the panel. Skip if cards render descriptions.

Expected combined effect: eager JS drops noticeably below today's ~118 KB
gzip, and both "reduce unused JavaScript" and TBT improve. Guardrail for
keeping it that way is in Phase 4.

---

## Phase 2 — Shrink / unblock the render-blocking CSS

Addresses: **Eliminate render-blocking resources**, **Reduce unused CSS**.

`index-*.css` (97 KB raw / 17 KB gzip) is the page's one render-blocking
resource. Two independent levers, in order:

### 2a. Remove dead legacy CSS (do this first)

`web/src/index.css` (4,462 lines) carries **both** the legacy pre-redesign UI
styles and the App206 redesign styles — its own comments distinguish
"redesigned shell" tokens from "the legacy, unscoped UI" (see ~lines 3500,
3596, 3813). The redesign (`App206`) is the shipped UI.

1. Use the Phase 0 coverage snapshot to quantify the unused fraction.
2. Determine whether any legacy component the old styles serve is still
   reachable (`LoadingScreen` at `App.jsx:1511` is; the old in-`App.jsx`
   sidebar/list markup may not be).
3. Delete CSS for unreachable UI, and move styles that belong to
   lazy-loaded components (e.g. `HealthDashboard`'s block, once 1c lands)
   into per-component CSS files imported by those components, so Vite splits
   them into the async chunks automatically (as it already does for
   `EventsMap-*.css`).

This is pure deletion/relocation — no loading-model change — and shrinks the
blocking resource that delays FCP. It also makes 2b less necessary.

### 2b. (Optional, only if 2a isn't enough) Make the app CSS non-blocking

The boot screen is deliberately styled **inline** in `index.html` so it
paints before the bundle CSS/JS arrive — but the render-blocking stylesheet
defeats that: FCP still waits for it. Since the real UI can't render until JS
executes anyway (React replaces `#root`), the stylesheet only needs to be
applied **before React mounts**, not before first paint:

- Post-process `index.html` (another small `transformIndexHtml` step) to load
  the stylesheet non-blocking (`rel="preload" as="style"` + `onload` swap,
  with a `<noscript>` fallback).
- In `web/src/main.jsx`, await the stylesheet's load promise before
  `createRoot(...).render(...)` so the app never commits unstyled (no FOUC).

Risk: medium — ordering bug shows an unstyled flash. Gate behind the e2e
suite plus a boot-profile run, and only take it if 2a leaves the CSS audit
still failing. Treat as its own PR.

---

## Phase 3 — Eliminate forced reflows

Addresses: **Forced reflow**. Three sources, worst first:

### 3a. Sticky day-header tracking in `App.jsx` (~lines 833–855)

The scroll handler queries **every** `.day-group-header` and calls
`getBoundingClientRect()` per header, per scroll event, un-throttled — plus
once at setup during load (the call Lighthouse's trace sees). Replace the
scroll-time geometry reads with an **IntersectionObserver** (one observer,
root = the scroll container, thin top rootMargin band): the browser hands
over intersection state without synchronous layout. Fallback ordering
guarantees identical behavior (headers are in date order, same as the current
loop's assumption).

### 3b. `DayScrubber.jsx` scroll follower (~lines 80–100)

Already rAF-batched, but still O(headers) `getBoundingClientRect()` per
frame while scrolling. Same IntersectionObserver conversion, or cache each
header's `offsetTop` once per layout change (the existing ResizeObserver
already signals those) and compare against `scrollTop` — one read instead of
N.

### 3c. Chip-row measurement in `views.jsx` (~lines 215–245)

The `useLayoutEffect` reads `clientWidth`/`offsetWidth` for every chip right
after commit — a guaranteed synchronous reflow on mount and on each
ResizeObserver tick. This one is a genuine measure-after-render and can't be
fully eliminated, but batch it: read all widths from the
`ResizeObserver`-provided entries where possible (`contentRect` is free), and
skip the recompute entirely when the row width is unchanged. Lowest priority
of the three — it fires once per layout change, not per scroll frame.

All three changes are behavior-preserving and covered by existing e2e specs
(day scrubber, agenda header, chip overflow); add locator assertions where a
spec doesn't already pin the behavior.

---

## Phase 4 — Verify and lock in the wins

The measurement rig already exists — use it, then tighten it:

- **Per-PR proof:** every phase-PR gets the Lighthouse trend comment
  (`pr-preview.yml` `lighthouse` job) showing score/LCP/TBT vs the `main`
  baseline. A phase doesn't merge unless its target audit's estimated
  savings visibly drop.
- **Ratchet the assertions:** `web/lighthouserc.json` currently *warns* below
  0.8. Once production holds ≥ 0.8 for a week of baselines, bump the warn
  thresholds (e.g. `minScore` 0.9 warn, and tighten `maxNumericValue` for LCP
  toward 2500 ms) so drift becomes visible immediately.
- **Ship the bundle budget** ([`web-performance-plan.md`](./web-performance-plan.md)
  Part 2, Layer 1 — still unshipped): after `vite build`, assert a gzip
  ceiling on the eager chunks (entry + vendor + CSS). This is what makes
  Phase 1c/2a permanent — without it, the next eager import silently undoes
  them. Surface the numbers in the PR comment per the Reporting Parity rule.

---

## Sequencing and risk summary

| Order | Item | Audit(s) addressed | Risk | Auto-merge? |
|---|---|---|---|---|
| 0 | Baseline capture | — | none | n/a (no code) |
| 1 | 1a data-fetch preloads | dependency tree, render-blocking | low | needs e2e; UI-adjacent → manual |
| 2 | 1c lazy HealthDashboard + lazy sidebar Fuse | unused JS | low | manual (infra/UI) |
| 3 | 1b font preload + weight audit | dependency tree | low | manual (UI) |
| 4 | 2a dead legacy CSS removal | unused CSS, render-blocking | low-med | manual (UI) |
| 5 | 3a/3b reflow → IntersectionObserver | forced reflow | med | manual (UI) |
| 6 | Phase 4 budget + ratchet | all (guardrail) | low | manual (CI/infra) |
| 7 | 2b async CSS (only if needed) | render-blocking | med | manual (UI) |
| 8 | 3c chip measurement batching | forced reflow | low | manual (UI) |

Every code phase is an independent PR with its own Lighthouse trend comment;
per the UI-changes rule, any user-visible change ships with a Playwright spec
and screenshots. All of these fall on the manual-merge side of the
auto-merge table (features/UI/infrastructure).

**Expected outcome:** phases 1–2 target the bulk of the score gap (chain
depth + blocking bytes are the heaviest-weighted audits at a 53); phase 3
cleans up TBT/INP-adjacent diagnostics; phase 4 keeps the score from
regressing. A realistic landing zone after phases 1–4 is the 80s on mobile,
at which point the `lighthouserc.json` warn threshold (0.8) is actually met
rather than aspirational.
