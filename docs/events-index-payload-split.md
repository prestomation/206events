# Two-phase events payload (issue #649)

`events-index.json` is the flat array of every published event. It grew large
enough (≈9 MB raw / ≈810 kB gzip) that loading it on boot made the web UI feel
sluggish on first paint. This document describes the two-phase progressive load
that fixes the *perceived* latency without breaking the discovery-API contract
or the favorites-Worker filter parity.

## Design

The full file stays exactly as it was — it remains the canonical discovery
resource that LLM consumers and the Cloudflare favorites Worker read unchanged.
The build additionally emits a small **`events-index-soon.json`**, and the web
UI loads it first.

### Build side

`lib/discovery.ts` → `buildEventsIndexSoon(eventsIndex, now, windowDays)` derives
the soon payload from the already-built full index. It is a pure function (so it
is unit-tested without clocks) with two size levers:

- **Date window** — keeps only events that *overlap* a window from one day
  before `now` (a lower grace so events earlier today that are still ongoing are
  retained) to `now + EVENTS_INDEX_SOON_WINDOW_DAYS` (9). Overlap is computed on
  `endDate` when present, so a multi-day event already in progress isn't dropped
  just because it started before the window. Nine days is wider than the UI's
  7-day "Happening Soon" window so the boundary is never missed even accounting
  for up to ~24h fetch-cache staleness plus the user's local timezone offset;
  the client always re-filters precisely.
- **`description` omitted** — descriptions dominate the per-event byte cost and
  aren't shown in the near-term list rows. The event detail view reads the full
  description from the full index once it has arrived.

`lib/calendar_ripper.ts` writes `output/events-index-soon.json` right after
`output/events-index.json`, logging its size. The new file is wired into the
discovery API the same way every other data file is:

- `buildIndexJson` adds an `eventsSoon` link (validated by `indexDocSchema`).
- `scripts/check-discovery-api.ts` requires the `eventsSoon` link target to
  exist on disk.
- `scripts/check-missing-urls.ts` lists `events-index-soon.json` in
  `REQUIRED_DATA_FILES`.
- `lib/templates/llms.txt` documents it and points consumers at the full index
  for complete data.

### Web side

`web/src/App.jsx`:

1. **Phase 1** — `await fetch('./events-index-soon.json')` and set `eventsIndex`.
   The near-term views (Happening Soon, Discover event counts/peeks) paint
   immediately from this small payload.
2. **Phase 2** — fire `fetch('./events-index.json')` *without awaiting* so it
   doesn't block the rest of boot. When it resolves it replaces `eventsIndex`
   wholesale (the soon payload is a strict subset, so there's no merge or dedup)
   and flips `fullEventsLoaded` to `true`.

Both setters guard `Array.isArray(...)` so a malformed payload degrades to an
empty list instead of crashing the memoized selectors.

While `fullEventsLoaded` is false **and** a search query is active, the TopBar
shows a small "Loading all events…" hint (`.a-search-loading`) so partial
search results aren't mistaken for "nothing found". It's only shown while
searching, so the default load gets no extra chrome or layout shift. The map and
favorites feed don't show a hint — they simply fill in silently once the full
index replaces the soon subset (a sub-second window in practice).

The service worker (`web/src/sw.js`) precaches and runtime-caches the soon
payload alongside the full index.

## Parity note

This change is purely a *loading strategy*; it does not touch filtering logic.
The favorites Worker (`infra/favorites-worker/src/feed.ts`) still reads the
unchanged `events-index.json`, so the "Favorites Filter Parity Rule" contract
(see `CLAUDE.md`) is unaffected — the search/geo/dedup logic is identical on
both sides.

## Future work

The full file's byte count is unchanged — only the *perceived* first-paint cost
drops. A larger follow-up could shrink the full file itself, most impactfully by
moving `description` out of `events-index.json` and serving it on demand. That
touches the Fuse search keys and the Worker's `event-search.ts` (which searches
`description`), so it must be done on both sides together and is intentionally
out of scope here.
