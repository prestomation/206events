# Temporal Event Grouping on the Map

## Problem

A conceptually-same event that recurs at one venue — a nightly musical, a
weekly show, a multi-night theatre run — arrives in `events-index.json` as **N
separate instances** (one per date), each with its own stable id but the same
title and venue coordinate. On the map this rendered as **N Leaflet markers
stacked on the exact same point**. `react-leaflet-cluster` then folded them into
a single *spatial* cluster badge (e.g. "12") sitting on one venue, with no way
to tell it was really one show running twelve nights, and no way to see the
individual dates.

## Goal

Show each recurring event as **one marker**, with a drill-down to see **all of
its dates**, each linking to that night's event page. One-off events are
unaffected.

## Approach

A pure, **client-side, map-display-only** transform. No build or schema change:
it derives groups from the existing `events-index.json` at render time.

It runs **after `isMappable`** in `EventsMap.jsx` — the predicate that owns
filter/feed/date-window membership and the favorites-worker parity contract — so
it never changes *which* events are in scope, only *how* the already-filtered
instances are drawn. A welcome consequence: because grouping sees only the
post-filter (in-window) set, a group's date count/list **automatically reflects
the active date window** with no extra date logic. The spatial
`MarkerClusterGroup` layer still clusters *distinct venues* on top — the two
layers are complementary.

### Grouping algorithm (`web/src/lib/event-grouping.js`)

Two deterministic phases:

1. **Bucket by venue + source.** Key = quantized coordinates (`quantizeCoord`,
   a ~50 m grid via `GROUP_COORD_EPSILON_DEG`, matching `event-dedup.js`'s
   0.05 km neighborhood so geocoding jitter doesn't split a series) + `icsUrl`.
   Different venues or different source feeds **never** merge.
2. **Fuzzy-cluster within each bucket.** Iterate the bucket in input order and
   greedily assign each instance to an existing cluster whose representative
   normalized title has token (Jaccard) similarity ≥ `GROUP_TITLE_SIMILARITY`
   (0.7), else start a new cluster. `titleSimilarity` is **reused** from
   `web/src/lib/event-dedup.js` rather than reimplemented.

`normalizeTitle` lowercases, collapses whitespace, and peels trailing
per-occurrence qualifiers — showtimes ("8pm", "7:30"), `- Evening` / `(Matinee)`
labels, and status annotations (`Sold Out`, `Cancelled`) — but only when the
trailing segment is *entirely* such tokens, so real subtitles ("Hamilton - An
American Musical") are preserved. This, combined with fuzzy matching, merges
showtime/title variants of one run while keeping genuinely different shows
apart.

Output: `Array<{ key, lat, lng, summary, count, instances }>`, `instances`
sorted by date ascending, group order deterministic (first-seen by input).

### Forward compatibility — `seriesId`

If the build ever stamps a stable `seriesId` onto events-index entries (derived
from an upstream RRULE/UID or a normalized title+venue), `groupEvents` already
**prefers it**: a `series:<id>` short-circuit groups those instances purely by
id, across venues, ahead of the heuristic path. That migration is a no-op for
this consumer.

### Marker + drill-down UI

- **Marker** (`EventsMap.jsx`): one per group. `count === 1` renders the default
  Leaflet marker unchanged (the global `Icon.Default` setup is untouched, so
  one-off events are pixel-identical to before). The `icon` prop is *omitted*
  for these — passing `icon={undefined}` overrides (and crashes) Leaflet's
  default icon in a real browser. `count > 1` gets a `createGroupBadgeIcon(count)`
  `L.divIcon` — the bundled pin plus a small corner count badge (design `--pin`
  colour).
- **Side panel** (`web/src/components/EventGroupPanel.jsx`): clicking a marker
  opens a drawer styled to the App206 design system — a mono `N dates` eyebrow,
  display-font title, source line, optional image, and a scrollable list of
  compact date cells (weekday + day-number + time) each linking to that
  instance's event page, with a sticky **month divider** (`July 2026`) inserted
  whenever the month changes, and a `📍 Open in maps` footer. The date list is
  capped at `MAX_GROUP_DATES` (50) with a "+N more dates" overflow line. Closes
  via its button or Esc. Because the panel is a real React subtree, the old
  imperative popup-HTML builders (and their manual `escapeHtml`) are gone — React
  escapes text by default; only `https?:`-scheme links/images are emitted.
  Attribution chips reuse the existing `<AttributionChips>` component.
- **Desktop vs mobile.** Desktop is a right-side panel; on `click` the map
  `panInside`s the marker out from behind it (`PANEL_WIDTH` reserved on the
  right). Below the tablet breakpoint (`useBreakpoint() === 'mobile'`, < 768) the
  panel is a **draggable bottom sheet**: it opens at a peek height and is resized
  by dragging its handle. Height is tracked in state and applied inline in `dvh`
  units (which follow the *visible* viewport, so the handle never hides behind
  the address bar), clamped to `[SHEET_MIN_DVH, SHEET_MAX_DVH]` so the sheet can
  shrink to just its header but can never grow past the top and become
  un-grabbable. The drag uses pointer capture + `pointercancel` (Android Chrome
  otherwise claims the gesture as a scroll) with `touch-action: none` on the
  handle. The event image is hidden on mobile (dates-first) and panning is
  skipped.

## Security

All event-supplied strings render through React (auto-escaped); links and images
are emitted only when they pass an `^https?://` guard, blocking `javascript:` /
`data:` URLs. No `dangerouslySetInnerHTML`.

## Files

- `web/src/lib/event-grouping.js` — grouping transform (+ `event-grouping.test.js`)
- `web/src/components/EventGroupPanel.jsx` — drill-down drawer (+ `EventGroupPanel.test.jsx`)
- `web/src/components/EventsMap.jsx` — wires grouping into the marker pipeline
- `web/src/index.css` — `.event-group-marker` / `.event-group-badge` / `.event-group-panel` styles

## Testing

`npm run test:web` covers normalization, coordinate quantization, group keys,
and `groupEvents` (N-instance collapse, fuzzy showtime merge, two-venue /
two-feed splits, matinee+evening same day, no-merge of distinct shows,
single/empty, `seriesId` short-circuit, window-count tracking, deterministic
order), plus `EventGroupPanel` rendering (single vs multi-date, `https`-only
link guard, `MAX_GROUP_DATES` cap + overflow, close button + Esc).
