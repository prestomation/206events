# Discover "Events" list: infinite scroll + offline recovery

## Problem

The Discover → **Events** list rendered a hard `evs.slice(0, 200)` and stopped
there with no affordance. On production data (thousands of events over a 6-month
window) 200 events is roughly a day and a half, so the list "ended" part-way
through tomorrow and read as *there is nothing else* — when in fact the rest of
the timeline was simply never rendered.

Separately, the events index loads in two phases (issue #649): a small
near-term `events-index-soon.json` paints first, then the full
`events-index.json` streams in behind it. If the browser was **offline** during
the phase-2 fetch, the failure was swallowed and the app stayed on the near-term
subset. Coming back online only flipped an `isOffline` flag — nothing re-fetched
the full index — so the list stayed truncated until a full page reload.

## What changed

### Infinite scroll (`web/src/redesign/views.jsx` → `EventsMode`)

- The full filtered set is computed once (uncapped, already date-sorted).
- A `visibleCount` state renders one page at a time (`EVENTS_PAGE_SIZE = 60`).
- An `IntersectionObserver` watches a sentinel at the bottom of the list and
  grows `visibleCount` by a page when it nears the viewport (`rootMargin:
  '800px'` preloads the next page so scrolling stays smooth).
- `visibleCount` resets to one page whenever the filtered set's identity changes
  (a filter edit, or the soon→full index swap) so the user starts near the top
  of the new list rather than deep in a stale scroll position.
- Explicit footer states replace the silent cut-off:
  - **more rows in memory** → the sentinel doubles as a "Loading more…" hint;
  - **everything rendered but the full index is still fetching**
    (`!fullEventsLoaded`) → "Loading more events…";
  - **genuine end** → "That's all N events." (`.a-listend`).

The DOM stays light (the reason the 200 cap existed) while every event is
reachable.

### Offline recovery (`web/src/App.jsx`)

- The phase-2 fetch is extracted into a reusable `loadFullEventsIndex(force)`
  callback. `fullIndexLoadedRef` tracks whether the full index *actually* landed
  (distinct from `fullEventsLoaded`, which flips true on either outcome so the
  "loading" hints stop); `fullIndexInFlightRef` guards against overlapping
  fetches.
- The `online` event handler calls `loadFullEventsIndex(false)`, which retries
  the full index only if it never successfully loaded. The retry is **silent** —
  no offline banner; the list just grows past the near-term window once the
  fetch lands.
- Boot and the service-worker `DATA_UPDATED` refresh call it with `force: true`
  so a fresh full index is always re-fetched on those paths.

## Tests

`web/e2e/events-pagination.spec.js`:
- **pagination** — 150-event fixture; asserts the first page renders, a late
  event is absent, then scrolling appends pages until the terminal marker shows
  the true total and the last event is reachable.
- **offline recovery** — the full index fails on first request and succeeds on
  retry; asserts the far-future event (present only in the full index) appears
  after an `online` event, without a reload.

Screenshots: `web/e2e/screenshots/events-pagination-loading.png` (freshly loaded
list) and `events-pagination-end.png` (terminal marker).
