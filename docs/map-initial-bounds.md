# Map initial bounds (issue #653)

## Problem

The events map (`web/src/components/EventsMap.jsx`) used to mount at the
city-center view — `center = city.config map.center`, `zoom = map.defaultZoom`
(12) — and only frame the actual events **after** the events index resolved,
via the `FitBounds` effect calling `map.fitBounds(...)`.

That ordering produced two avoidable costs on every page load:

1. **Wasted tiles.** The map immediately requested OSM tiles for downtown
   Seattle at zoom 12. When `FitBounds` then zoomed out to frame the
   county-wide event spread (~zoom 10), every one of those zoom-12 tiles was
   discarded.
2. **A visible animated zoom-out.** `fitBounds` animates, so the user saw the
   map lurch from downtown-zoom-12 out to the metro view, and the *correct*
   tiles only began loading once that animation kicked in.

## Change

Mount the map already framed at the metro extent (`city.config map.clampBounds`,
the King County box the project already uses to reject distant outliers from the
fit) by passing react-leaflet's `bounds` prop instead of `center`/`zoom`:

```jsx
const INITIAL_BOUNDS = [
  [CLAMP_BOUNDS.south, CLAMP_BOUNDS.west],
  [CLAMP_BOUNDS.north, CLAMP_BOUNDS.east],
]

<MapContainer bounds={INITIAL_BOUNDS} boundsOptions={{ padding: [0, 0] }} … />
```

`FitBounds` is unchanged — it still snaps to the real event distribution once
events arrive. But because the map already opens at roughly the destination
zoom, that adjustment is a small nudge (one zoom level in practice) instead of a
two-level animated zoom-out from downtown, and the first tiles requested are
already at the right zoom.

This is option A from the issue ("hardcoded bounds for the Seattle area"),
reusing the existing `clampBounds` rather than computing a build-time event
envelope (option B) — the clamp box already *is* the populated event envelope
for this community calendar, so the extra build-pipeline machinery of option B
buys nothing here.

## Before / after numbers

Measured locally against the production bundle (`vite preview`) with a Chromium
build, using metro-spread fixtures (six venues across Seattle / Bellevue /
Renton / Kirkland / Issaquah / Federal Way, so the events' natural fit ≈ the
metro extent — the real production shape). Timings are from navigation start;
3 runs each, representative values:

| Metric | Before (center/zoom 12) | After (bounds = metro) |
|---|---|---|
| First tile request zoom | **12** (downtown) | **9** (metro extent) |
| Tiles at the *final* zoom start loading | **~582 ms** | **~323 ms** |
| Gap from first tile → final-zoom tiles | **~260 ms** (animated zoom-out) | **~15 ms** (immediate) |
| Initial→final zoom travel | 12 → 10 (two levels, animated) | 9 → 10 (one-level nudge) |
| Discarded (wrong-zoom) tiles | 14 | 12 |

**Headline:** the correct-zoom map tiles begin loading **~260 ms sooner** (~44 %
faster to useful tiles in the local harness) and the jarring downtown→metro
zoom-out animation is gone. The local preview is network-fast; over a real
connection the eliminated gap is animation-bound (Leaflet's zoom animation), so
the perceived "snappier map" win holds or grows.

The measurement is also encoded as a regression guard: the e2e test
`web/e2e/map.spec.js` → *"requests metro-extent tiles at mount"* asserts the
first OSM tile request is a metro-extent zoom (≤ 11), which fails on the old
city-center-zoom-12 behavior.
