# Live Search in a Web Worker (N-4)

Moves the events-index **parse**, the **Fuse index build**, and every **search
query** off the main thread into a dedicated Web Worker, so typing and scrolling
never block on search work. This is item **N-4** from
[`web-performance-plan.md`](./web-performance-plan.md), implemented after the
lower-risk batch (deferred query, dead-memo deletion, lazy map/ICAL, vendor
chunks, parsed-date cache) had landed and the main-thread search pass was still
the dominant felt cost.

## The problem

The June 2026 measurement pass ([`web-performance-2026-06.md`](./web-performance-2026-06.md))
found that **main-thread CPU, not network, is the bottleneck.** Three pieces of
that CPU all ran on the main thread:

| Work | Where it ran | Cost (desktop → mobile ≈3–5×) |
|---|---|---|
| `JSON.parse` of `events-index.json` (~9.6 MB, ~11k events) | `App.jsx` `.then(r => r.json())` | ~31 ms → ~100–150 ms |
| Fuse index build over the upcoming corpus | `App206.jsx` `queryFuse` memo | ~52 ms → ~0.2 s |
| Each query's whole-field bitap scan (`ignoreLocation: true`) | `App206.jsx` `queryKeySet` memo | ~120 ms/query → ~0.5 s/query |

`useDeferredValue` (shipped earlier) made the search *low priority* so it didn't
block the *keystroke*, but the scan still occupied the main thread for its whole
duration, stuttering scroll and any concurrent render. The structural fix is to
get the work off the thread entirely.

## The design

```
                 main thread                          worker thread
  ┌──────────────────────────────────────┐     ┌───────────────────────────┐
  │ fetch('./events-index.json')          │     │                           │
  │   → arrayBuffer()  (bytes, NO parse)  │     │                           │
  │   → searchClient.parse(buf) ──────────┼──▶  │ JSON.parse(decode(buf))   │
  │                                        │     │ new Fuse(events, …)       │
  │ setEventsIndex(events) ◀──────────────┼──   │ postMessage({events})     │
  │   (render lists / map)                 │     │                           │
  │                                        │     │                           │
  │ searchClient.search(q) ───────────────┼──▶  │ fuse.search(q)            │
  │ setQueryKeySet(keys) ◀────────────────┼──   │ → Set<eventKey>           │
  └──────────────────────────────────────┘     └───────────────────────────┘
```

Three modules under `web/src/lib/`:

- **`searchEngine.js`** — the pure, framework-free core: `SEARCH_FUSE_OPTIONS`
  and `createSearchEngine(events)` → `{ search(q) }`. Shared verbatim by the
  worker and its fallback so the algorithm can never drift between threads.
  `search` returns a `Set` of `eventKey` (`summary|date`) hits, or `null` for an
  empty query (the "no filter" signal — distinct from an empty Set, "query, zero
  matches").
- **`searchWorker.js`** — the worker entry. Holds one engine; handles `index`
  (rebuild from an already-parsed corpus), `parse` (decode + `JSON.parse` a
  transferred `ArrayBuffer`, rebuild, return the parsed array), and `search`
  (run the scan, post back the `Set`).
- **`searchClient.js`** — the main-thread handle: a small promise-based API
  (`index` / `parse` / `search` / `destroy`) that correlates worker replies by a
  monotonic `reqId`. **When `Worker` is unavailable** (jsdom unit tests,
  restrictive CSP, very old browsers) it transparently runs the same engine on
  the main thread, so behavior is identical everywhere — callers never branch.

### Why the fetch stays on the main thread

The worker does **not** fetch the URL itself. The main thread does the
`fetch(...)` and reads `arrayBuffer()` (cheap — no parse), then **transfers** the
`ArrayBuffer` to the worker (zero-copy). Keeping the request on the page:

- preserves the **service-worker cache / offline path** (`sw.js` precaches
  `events-index.json`; the request must originate from the page to hit it),
- keeps the existing **fetch-cache** and Playwright `page.route` mocks working
  unchanged, and
- avoids worker-relative-URL resolution pitfalls.

The expensive `JSON.parse` + index build run in the worker; the main thread only
hands over bytes.

### What's a genuine win vs. an unavoidable cost

The main thread still needs the parsed events to **render** the lists and map,
so the worker posts the array back — a `structuredClone` the main thread
deserializes (~the cost of the parse it replaced). So the **parse block is
roughly neutral** on the main thread; what's eliminated outright is the **Fuse
index build (~52 ms) and every per-query scan (~120 ms)** — the per-keystroke
freeze users actually felt. Net: the main thread is free for input and scroll
during search, which is exactly N-4's goal. (Fully removing the corpus-transfer
cost would require moving list/map rendering data derivation into the worker too
— a much larger change, out of scope here.)

### Search over a superset is safe

The worker indexes the **raw corpus** it parsed (all ~11k entries), whereas the
old `queryFuse` indexed only `upcomingEvents` (date-windowed, de-duplicated).
This is correct because consumers filter their lists with a **membership test**
(`queryKeySet.has(eventKey(e))`) over events that are *already* scoped to the
upcoming, non-duplicate window — so extra keys for past or duplicate events are
never queried. Results are identical; the worker just gets to build its index
immediately after parsing without waiting on main-thread filtering.

### Two-phase load

The near-term `events-index-soon.json` is still fetched and parsed on the main
thread (it's small and paints first), then pushed to the worker via
`index(soonData)` so search works during the window before the full index lands.
When the full index arrives, `parse()` re-indexes the worker and `setEventsIndex`
swaps the corpus; the App206 search effect re-runs (keyed on `eventsIndex`) so
in-flight results refresh against the full set.

### Async search in App206

`queryKeySet` changed from a synchronous `useMemo` to `useState` updated by an
effect that calls `searchClient.search(deferredQuery)`. A `cancelled` flag drops
stale resolutions; `searchInFlight` feeds `queryPending` so the "Searching…" hint
shows until the first result for a new query lands. `query` still flows through
`useDeferredValue` to coalesce rapid commits, but the heavy work is off-thread
regardless. All downstream consumers (`matchEvents`, `evMatchCount`, the
cross-tab smart-switch, the Leaflet marker layer) read `queryKeySet` unchanged.

## Measured impact (local A/B)

A same-machine Lighthouse A/B (mobile preset, median of 3, **identical** 6.6 MB
synthetic 11k-event index served to both builds via a local static server —
`main` vs this branch) isolates the code change from hosting noise:

| Metric | main | this branch | Δ |
|---|---|---|---|
| **TBT** (main-thread blocking; lab proxy for INP) | 8062 ms | 3957 ms | **−4105 ms (−51%)** |
| **TTI** | 12973 ms | 8894 ms | **−4078 ms** |
| Total main-thread work | 10220 ms | 9542 ms | −679 ms |
| JS bootup (script eval) | 8695 ms | 8042 ms | −653 ms |
| Longest single main-thread task | **8064 ms** | **3434 ms** | the monolithic parse-+-2×-Fuse-build block is broken up |
| FCP | 3153 ms | 3154 ms | ≈ |
| CLS | 0.000 | 0.000 | ≈ |
| LCP | 3533 ms | 4522 ms | **+989 ms** |
| Performance (composite) | 54 | 48 | −6 |

The headline — **TBT halves and the single 8-second blocking task drops to
3.4 s** — is exactly the interactivity win this change targets (the "typing /
scrolling freezes" complaint maps to TBT/INP). The **tradeoff is LCP +~1 s**:
full-content render is now gated on the worker round-trip (fetch → transfer →
parse → post back) instead of an inline parse, so the largest element paints a
bit later even though the main thread is free. Because Lighthouse weights LCP
heavily, the *composite* score dips 6 points despite the large TBT/TTI gains — a
load-only lab score under-represents an interactivity-focused change (and can't
see the INP win at all, since it performs no interaction).

> Note: this is the **opposite** of what the CI "🔦 Lighthouse" PR comment
> showed. That comment compares the **cold Cloudflare preview** against a
> **production** baseline (`206.events`, warm CDN/Brotli/SW) — an
> infra-vs-infra gap, not a code delta. The uniform regression it showed across
> CLS/FCP (which this change cannot affect) is the tell; the same-environment
> numbers above are the real code impact.

## Parity note

This is the **client-only live search box**. It is *not* the parity-locked
saved-search-filter path (`App.jsx` `perFilterMatches` ↔
`infra/favorites-worker/src/event-search.ts`), so its algorithm can be tuned
independently — see the parity rule in `AGENTS.md`. The Fuse *options* are
unchanged (same keys, threshold, `ignoreLocation`); only the thread moved.

As a small related cleanup, `perFilterMatches` now early-returns when there are
**no saved filters**, skipping a full-corpus Fuse build on the main thread for
the common (anonymous / no-saved-search) case.

## Testing

- **`searchEngine.test.js`** — the pure engine: key-set results, null-on-empty,
  whole-field/location matching, empty-corpus safety, option surface.
- **`searchClient.test.js`** — the main-thread fallback (jsdom has no `Worker`):
  `index`/`parse`/`search`, malformed-JSON rejection, empty-corpus search.
- **`App.test.jsx`** — the integration search tests run through the fallback; the
  fetch mock now backs `arrayBuffer()` so the full-index parse path is exercised.
- **`e2e/search-deferred.spec.js`, `cross-tab-search.spec.js`,
  `payload-split.spec.js`** — run in **real Chromium**, exercising the actual
  worker path (build, query, soon→full transition, cross-tab counts).

No visual change ships with this PR — the UI is byte-for-byte identical; only the
thread that search runs on differs. (Hence no new screenshots.)

## Follow-ups (not in this PR)

- Move `perFilterMatches` (saved-search filters) into the same worker — it's the
  other main-thread Fuse build, but it's on the parity-locked path, so it's a
  deliberate, separately-reviewed change.
- O-1b / O-3 (cut per-query description cost / trim the index `description`
  payload) remain open product/payload-shape calls; the worker reduces their
  urgency since the scan no longer blocks the main thread.
