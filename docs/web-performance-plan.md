# Web Performance — Optimization & Measurement Plan

A forward-looking plan for keeping 206.events fast as the event corpus grows
(currently ~11k events / 9.6 MB raw index). It has two halves:

1. **Optimizations** — concrete changes ranked by impact, building on the
   one-time analysis in [`web-performance-2026-06.md`](./web-performance-2026-06.md)
   and adding bundle/code-splitting findings that analysis didn't cover.
2. **Measurement** — how to *track performance over time* so regressions are
   caught in CI instead of by user reports. This is the piece that is currently
   missing: today there is no perf budget, no benchmark, and no field telemetry.

The guiding diagnosis from the June pass still holds: **the network is not the
bottleneck — main-thread CPU is.** The server serves Brotli (832 KB for the full
index) and a phased `soon`/full split paints near-term views first. The lag the
user feels is JS execution: parsing 9.6 MB of JSON, building Fuse indices over
~10k descriptions, and re-parsing dates several times per render.

---

## Part 1 — Optimizations

### Already shipped (June 2026 pass)

These are done; listed so this plan isn't read as re-proposing them. See the
prior doc for detail.

- `useDeferredValue` on the live search query (kills the typing freeze).
- Deleted dead full-corpus memos from `App.jsx` (~56 ms + ~5 MB/load reclaimed).
- Uncontrolled search input (fixes Android dropped keystrokes).

### Open items carried forward from the June pass

| # | Change | Risk | Est. win |
|---|---|---|---|
| O-4 | Cache parsed dates per event (parse once, not 3–4× per render) | low | smoother re-filters (date-window drag, tag switches) |
| O-1b | Trim live-search description cost (drop `description` from live Fuse keys, or substring-match it) | med (behavior) | 121 → ~3–38 ms/query |
| O-3 | Trim/relocate index `description` (39% of payload, search-only) | med (payload shape) | ~3.7 MB lighter index, less heap, faster parse |

O-4 is pure mechanical speedup and should land first. O-1b and O-3 carry a
product/behavior tradeoff (fuzzy → near-exact description matching) and need a
deliberate call — they're tracked here, not auto-merged.

### New findings (not in the June pass)

The June analysis focused on data-path CPU. It did **not** look at bundle
composition / Time-to-Interactive, where there are clean wins because two of the
heaviest dependencies are loaded eagerly despite being behind a toggle.

#### N-1. Lazy-load the Leaflet map stack (biggest TTI win)

`EventsMap` is imported **statically** in `web/src/redesign/shell.jsx`:

```js
import { EventsMap } from '../components/EventsMap.jsx'
```

That pulls `leaflet` + `react-leaflet` + `react-leaflet-cluster` + the Leaflet
CSS and marker images into the **main entry chunk**, so every visitor downloads
and parses the entire map engine on first paint — even though the map is behind
a toggle (`showMapView` / `mapExpanded`) and many sessions never open it.
Leaflet alone is ~150 KB min; the cluster plugin adds more.

**Fix:** `const EventsMap = React.lazy(() => import('../components/EventsMap.jsx'))`
and render it inside `<Suspense fallback={…}>`. The map chunk then loads only
when the user first reveals the map. This is the single largest reduction to the
initial JS the browser must parse before the app is interactive.

#### N-2. Lazy-load `ical.js`

`ICAL` is imported eagerly in `App.jsx` but is only used in **one place** — the
`loadEvents` effect that parses a channel's `.ics` when a channel detail is
opened. `ical.js` is a non-trivial parser shipped to every visitor up front.

**Fix:** dynamic-import it inside `loadEvents` (`const ICAL = (await
import('ical.js')).default`). Moves it out of the entry chunk into a chunk
fetched only on first channel open. (`src/lib/icsImage.js` operates on an
already-parsed VEVENT handed in by the caller and imports nothing itself, so it
needs no change — it works on whatever the lazily-loaded parser produces.)

#### N-3. Vendor chunk splitting

`web/vite.config.js` has no `build.rollupOptions.output.manualChunks`, so Vite's
default chunking applies. Splitting stable vendor code (`react`/`react-dom`,
`fuse.js`, `dompurify`) into its own long-lived chunk means a content/UI deploy
doesn't bust the vendor cache, improving repeat-visit load. Pairs naturally with
N-1/N-2 (which already carve out the map and ICAL).

#### N-4. Offload Fuse search/index-build to a Web Worker (larger lift)

Even deferred (the `useDeferredValue` change shipped in the June pass), the Fuse
`search()` still runs on the main thread
(~120 ms desktop / ~0.5 s mobile per committed query) and the index build runs
on load. Moving the index build + queries into a Worker keeps the main thread
free for input and scroll entirely. This is the structural fix if O-1b's
behavior change isn't acceptable. Bigger change (message protocol, async result
plumbing) — propose only if O-1b is rejected and search lag persists.

### Recommended optimization sequencing

| Order | Item | Risk | Why first |
|---|---|---|---|
| 1 | N-1 lazy map | low | biggest TTI win, no behavior change |
| 2 | N-2 lazy ICAL | low | removes a parser from the entry chunk |
| 3 | O-4 parsed-date cache | low | smoother re-filters, no behavior change |
| 4 | N-3 vendor chunks | low | better repeat-visit caching |
| 5 | O-1b / O-3 | med | product sign-off (behavior/payload shape) |
| 6 | N-4 search Worker | med-high | only if O-1b rejected and lag remains |

N-1 through N-3 + O-4 are all low-risk, no-user-visible-behavior changes and can
ship as small independent PRs.

---

## Part 2 — Measuring performance over time

The June pass was a heroic **one-time** manual benchmark ("benchmarks are not
committed, throwaway scripts over a 9.6 MB prod download"). That's why the
sluggishness was only found after users reported it. The goal here is to make
performance a **tracked, regression-gated number** with three layers, cheapest
first.

### Layer 1 — Payload & bundle budgets in CI (cheapest, highest leverage)

A lightweight check that fails (or warns) when the things we already know matter
grow past a threshold. No browser needed; runs in seconds.

- **Index payload budget.** After the build, measure the Brotli'd transfer size
  of `events-index.json`, `events-index-soon.json`, `venues.json`,
  `manifest.json`. Assert each stays under a committed budget (e.g. full index
  ≤ 1.0 MB Brotli, soon ≤ 200 KB). This is the natural home for catching O-3-type
  growth: when `description` bloat pushes the index past budget, the PR that
  added the events is the one that sees the failure. Fits alongside the existing
  `scripts/check-discovery-api.ts` (which already budgets `venues.json` at
  500 KB — extend that pattern rather than invent a new harness).
- **JS bundle budget.** After `vite build`, sum the entry chunk's gzip size and
  assert a ceiling. This is what makes N-1/N-2/N-3 *stick* — without a budget,
  the next eager `import` of a heavy dep silently undoes them.
- **Reporting parity.** Per the repo's Reporting Parity rule, surface budget
  numbers in the build summary / PR comment so a near-miss is visible before it
  becomes a failure.

### Layer 2 — Committed CPU micro-benchmark for the hot paths

The user's lag is CPU, and CPU cost isn't captured by payload size. Commit a
small, deterministic benchmark (`web/bench/` or a `vitest bench` suite) that
times the exact hot paths the June pass measured by hand, against a **fixed,
committed fixture** (a sampled subset of a real index — a few hundred events, so
it's not a 9.6 MB blob in git):

- `Fuse` index build + a representative `search()` (the "typing in search" cost).
- `upcomingIndexEvents` (map + `parseIndexDate` + filter + sort).
- `groupIndexEventsByDay`.
- `parseIndexDate` in isolation (validates the O-4 date-cache win).

Run it in CI and **print the timings to the job summary**. Absolute ms vary by
runner, so don't hard-gate on wall-clock; instead either (a) track the number
over time, or (b) gate on a *structural* proxy that is machine-independent — e.g.
"how many times is `parseIndexDate` called per render pass" via a spy counter,
which is exactly what O-4 changes from 3–4× to 1×. Structural assertions are
stable across machines where raw ms are not.

This turns "is search still fast?" from a manual reproduction into a number that
shows up on every PR touching the data path.

### Layer 3 — Field telemetry (RUM) via the existing cookieless analytics

Lab numbers (Layers 1–2) don't capture real devices and networks. Core Web
Vitals from real visitors do — **LCP**, **INP** (the metric for "typing/tapping
feels slow" — directly the user's complaint), and **CLS**.

**Privacy constraint (hard):** per [`privacy-and-consent.md`](./privacy-and-consent.md),
the site runs with **no consent banner** and analytics must be **cookieless and
non-identifying**. So RUM must not introduce a tracker. The compliant path:

- Use the `web-vitals` library (tiny, no network of its own) to collect
  LCP/INP/CLS in the browser, then report each as a **GoatCounter custom event**
  (the analytics tool the site already uses — cookieless, no fingerprinting,
  already consent-exempt). `App.jsx` already has a `trackEvent` helper that calls
  `window.goatcounter.count({ path, event: true })`; reporting
  `web-vitals/INP=<bucket>` through that same path keeps everything first-party
  and inside the existing privacy posture. **Do not** add Google Analytics, a
  RUM SaaS, or anything that sets a cookie — that would require a banner and is
  out of bounds.
- Report **bucketed** values (e.g. INP `good`/`needs-improvement`/`poor` per the
  web-vitals thresholds), not raw per-user timings, to stay non-identifying.
- Honor the same prod-only guard the GoatCounter loader uses (skip previews and
  localhost) so PR previews don't pollute the field data.

This gives a trend line of real-world INP/LCP over time, segmented by the events
GoatCounter already records, with zero new third-party requests.

### Optional — Lighthouse CI against the PR preview

PR previews already deploy to `gh-pages` under `/preview/{PR}/`. A
`web-lighthouse.yml` workflow (mirroring `web-e2e.yml`) could run Lighthouse
against that URL and post the Performance score + LCP/TBT/CLS as a PR comment.
Heavier than Layers 1–2 and noisier (hosted-runner variance), so treat it as an
informational comment, not a hard gate. Worth it once Layers 1–2 exist and we
want a single headline score per PR.

### Recommended measurement sequencing

| Order | Layer | Effort | What it catches |
|---|---|---|---|
| 1 | Payload + bundle budgets in CI | low | index/bundle bloat (incl. N-1/N-2/N-3 regressions) |
| 2 | Committed CPU micro-benchmark | low-med | search/parse/group regressions on the data path |
| 3 | web-vitals → GoatCounter RUM | med | real-device INP/LCP/CLS trend (the user-felt metric) |
| 4 | Lighthouse CI on preview (optional) | med | single headline score per PR |

Layer 1 is the highest leverage for the least work and should land first — it's
what keeps the optimization wins from silently eroding.

---

## How the two halves connect

- **N-1/N-2/N-3** shrink the entry bundle → **Layer 1's bundle budget** keeps it
  shrunk.
- **O-3** shrinks the index payload → **Layer 1's payload budget** is where its
  regression would surface.
- **O-4 / O-1b / N-4** cut search/parse CPU → **Layer 2's benchmark** (and the
  `parseIndexDate`-call-count structural assertion) proves the win and guards it.
- The user-reported symptom ("typing feels slow") maps to **INP**, which only
  **Layer 3** measures on real devices — so Layer 3 is what tells us whether the
  fixes actually helped the people complaining.
