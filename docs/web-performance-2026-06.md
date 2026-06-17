# Web Performance Measurement — June 2026

A measurement pass against **production data** (`https://206.events`) to explain
the reported sluggishness ("typing in search, on load, and other places") and to
rank concrete improvement opportunities. This document is the analysis; each
recommendation links to the exact code site and the measured cost so the fixes
can be picked off independently.

## Method

- Pulled the live prod payloads (`events-index.json`, `events-index-soon.json`,
  `venues.json`, `manifest.json`) and measured transfer sizes across encodings.
- Reproduced the app's hot paths in a standalone Node benchmark using the real
  `events-index.json` (11,220 events) and the same `fuse.js` version the bundle
  ships (`web/node_modules/fuse.js`), with the app's exact Fuse options
  (`threshold: 0.1`, `ignoreLocation: true`, keys `summary,description,location`).
- Numbers below are **desktop Node** timings. A mid-range phone runs the same
  JS roughly **3–5× slower**, so multiply accordingly for the mobile experience.

Benchmarks are not committed (throwaway scripts over a 9.6 MB prod download), but
every figure is reproducible by parsing the prod `events-index.json` and timing
the snippets identified below.

## What the payload looks like

`events-index.json` is an array of **11,220 events, 9.59 MB raw**. Field-by-field
byte contribution:

| Field | Share | Field | Share |
|---|---|---|---|
| `description` | **38.9%** | `icsUrl` | 4.9% |
| `url` | 8.7% | `geocodeSource` | 2.9% |
| `imageUrl` | 7.6% | `duplicateGroupId` | 2.1% |
| `location` | 7.3% | `lng`/`lat` | 3.0% |
| `endDate` | 5.9% | `cost` | 1.6% |
| `date` | 5.5% | `osmId`/`osmType` | 2.9% |
| `summary` | 5.1% | `uncertainty`,`duplicateOf`,… | ~4% |

### Network is **not** the bottleneck

The server already serves Brotli, and the phased `soon`/full split
(`docs/events-index-payload-split.md`) paints near-term views off a small first
payload:

| File | raw | gzip | **brotli (served)** |
|---|---|---|---|
| `events-index.json` | 9369 KB | 1208 KB | **832 KB** |
| `events-index-soon.json` | 1557 KB | 179 KB | **139 KB** |
| `venues.json` | 300 KB | 38 KB | **38 KB** |
| `manifest.json` | 148 KB | 19 KB | **21 KB** |

832 KB Brotli for the full index is reasonable, and the service worker caches it.
The cost that hurts is **CPU on the main thread**, not download.

## Findings, ranked by impact

### 1. Live search blocks the main thread (~120 ms/query desktop → ~0.4–0.6 s mobile) — *the "typing in search" lag*

The redesign's live search (`web/src/redesign/App206.jsx`, `queryFuse`/`queryKeySet`)
is well-architected for *rebuild* cost — one Fuse index, memoized, with a 200 ms
debounce in the TopBar (`shell.jsx`) and a local `text` state that keeps the caret
responsive. **But the search call itself is expensive and runs synchronously** when
the debounced query commits:

```
search latency (queryFuse): avg 121 ms/query, max 239 ms   (desktop Node)
```

The dominant factor is `ignoreLocation: true` over the long `description` field —
Fuse runs a bitap scan across the *entire* description of all ~10k upcoming events:

| Search config (same corpus, 10 queries) | avg | max |
|---|---|---|
| fuzzy, `[summary,description,location]`, `ignoreLocation:true` **(current)** | **160 ms** | 259 ms |
| fuzzy, `[summary,location]` (drop description) | 38 ms | 60 ms |
| fuzzy, `[summary,description,location]`, **default location** (no `ignoreLocation`) | 31 ms | 42 ms |
| plain lowercased-blob `.includes()` (non-fuzzy) | **2 ms** | 4 ms |

When the query commits, `queryKeySet` recomputes synchronously and every consumer
(Discover/Following lists, the Leaflet marker layer) re-renders in the same frame —
so the UI freezes for the whole search+render. On a phone that's a ~0.5 s lock-up
per committed query, and rapid typing stacks the commits.

**Note on parity:** this live `query` box is **client-only** and is *not* the
parity-locked saved-search-filter path (`searchFilters` → favorites-worker). The
"Favorites Filter Parity" rule governs `perFilterMatches`/`event-search.ts`, not
this live box, so the live box's algorithm can be tuned independently.

**Recommended fixes (in order):**

- **Defer the work off the input.** ✅ *Implemented in this PR.* The committed
  query is now wrapped in `useDeferredValue` (`App206.jsx`), mirroring the existing
  `dateWindow` pattern, so `queryKeySet` + the dependent re-renders run at low
  priority and never block typing/scrolling. Zero change to search semantics.
  **Biggest UX win for the smallest, safest change.**
- **Cut the per-query cost.** `threshold: 0.1` is already near-exact, so the
  fuzzy tolerance buys little over the description field while costing 5–80×. Either
  drop `description` from the live keys (search summary+location fuzzy, 38 ms) and
  fall back to a precomputed lowercased-blob substring pass for description hits
  (~2 ms), or precompute the blob once on `upcomingEvents` and make the live box a
  scored substring match. This is a **user-visible behavior change** (fuzzy →
  near-exact for descriptions) and should be a deliberate product call.

### 2. Dead full-corpus work runs on every index load — *part of the "on load" cost*

`web/src/App.jsx` predates the `App206` redesign and is now only a data/state
container — its single render path is `LoadingScreen` or `<App206 .../>`. Several
heavy memos compute on each `eventsIndex` change but their results are **never
passed to `App206` and never rendered**. `searchTerm` is also permanently `''`
(the only setter call is `setSearchTerm('')`), so the search-gated branches are
inert — but the **Fuse indices still build** regardless of the guard:

| Dead memo (`App.jsx`) | Cost per load | Status |
|---|---|---|
| `eventFuse` (full Fuse over 11k incl. descriptions) | **~43 ms + ~5 MB heap** | only consumer chain (`eventMatchesByCalendar` → `filteredCalendars`) is unused by `App206` |
| `happeningSoonEvents` (map+parse over 11k, +Fuse) | ~13 ms | declaration-only reference |
| `livePreviewMatches` (full Fuse over 11k per keystroke) | full index build | declaration-only reference; `newFilterInput` is never set |
| `filteredEvents` | Fuse build | declaration-only reference |
| `favoritesEvents` / `favoritesEventsFlat` | 11k map | not passed to `App206` |
| `eventMatchesByCalendar`, `calendarNameMatches`, `filteredCalendars` | — | chain consumed only by each other / dead `filteredCalendars` |

The index builds run **twice per load** (once on the `soon` payload, once on the
full index, because the memos key off `eventsIndex`). React StrictMode (dev only)
doubles it again. `App.test.jsx` exercises the **`App206` TopBar** ("Search events
& venues…"), not the legacy `searchTerm` path, so this code is unprotected and
safe to remove.

**Recommended fix:** ✅ *Implemented in this PR.* Deleted the dead memos and their
now-orphaned state/effects from `App.jsx` (~56 ms + ~5 MB reclaimed per load, no
rendered-UI change). Kept `perFilterMatches`/`searchFilterMatchSummaries`/
`eventAttributions`/`followingGroups` — those *are* live (they feed the Following
view and attribution chips).

### 3. `events-index.json` is dominated by `description` (39% of 9.6 MB) — *load + memory*

Every event's full `description` ships in the index purely so the live search can
match it. That's 3.7 MB of text the browser must download (Brotli'd), `JSON.parse`
(~31 ms), hold in memory, and index into Fuse (~52 ms). The detail view that
actually *renders* a description fetches the ICS on demand
(`App.jsx` `selectedCalendar.icsUrl`), so the index copy exists only for search.

**Recommended fix (larger, product-flavored):** either
- truncate index descriptions to a search-sized snippet (e.g. first 200–300 chars)
  — most fuzzy matches hit the title/start anyway — cutting the biggest field by a
  large factor; or
- move description search to a build-time inverted index / prebuilt Fuse index
  shipped as a separate file (a prebuilt Fuse index loads in **0.1 ms** vs 52 ms to
  build, though it adds ~5 MB to download — only worth it paired with description
  trimming).

This intersects the `soon`/full split design; coordinate with
`docs/events-index-payload-split.md` before changing the index shape.

### 4. Dates are re-parsed with regex many times per event — *minor, pipeline-wide*

`parseIndexDate` (regex `match` + `replace` + `new Date`) is called per-event in
`upcomingIndexEvents`, again in `eventInWindow` (date-window filter), again in
`rowFromIndexEvent`, and again in `groupIndexEventsByDay`. The same ~10k dates are
parsed 3–4× per render pass. `upcomingIndexEvents` alone is ~39 ms.

**Recommended fix:** parse once and cache the `{date, timezone}` on the event
view-model (or a `WeakMap`) when `upcomingEvents` is built, then have the window
filter / row builder / grouping read the cached value. Removes most repeat regex
work; helps every re-filter (date-window drag, tag/category switches).

## Suggested sequencing

| # | Change | Risk | Est. win | Status |
|---|---|---|---|---|
| 1a | `useDeferredValue` on live query | very low | kills the typing freeze | ✅ done (this PR) |
| 2 | Delete dead `App.jsx` memos | low | ~56 ms + ~5 MB/load | ✅ done (this PR) |
| 4 | Cache parsed dates | low | smoother re-filters | open |
| 1b | Trim live-search description cost | med (behavior) | 121 → ~3–38 ms/query | open (product sign-off) |
| 3 | Trim/relocate index `description` | med (payload shape) | ~3.7 MB lighter index | open (coordinate w/ payload-split) |

1a + 2 address the two headline complaints ("typing in search" and "on load") at
low risk and are implemented here. 4, 1b, and 3 remain as follow-ups — 1b and 3
carry product/behavior tradeoffs and should be deliberate decisions.
