# Tab-Switch Responsiveness — Improvement Plan

**Status: implemented** (same PR as this plan: measurement plus Fixes 1–3
and Fix 4's first step, one commit each; Fix 4's full context-slice split
remains follow-up, to be justified by the `youOpen` trend).

Reported symptom: once the page has loaded, tapping the **You** or **Map**
bottom-nav tab is noticeably slow. This is a different regression class from
the boot-time freezes covered by `docs/web-boot-profiling-ci.md` — the app is
idle, the corpus is settled, and a single tap still takes long enough to feel
broken. This doc explains why, defines how we measure it, and stages the
fixes.

## Measurement (shipped with this plan)

Two post-settle metrics added to the boot-profile harness
(`web/scripts/boot-profile.mjs`), reported per-PR alongside the existing six
(see `docs/web-boot-profiling-ci.md` for the full table and noise bands):

| Key | What it owns |
|---|---|
| `mapReopen` | Second Map-tab open after leaving the tab: Leaflet re-init + marker pipeline with the lazy chunk already cached — the recurring cost every Map visit after the first pays today |
| `youOpen` | Discover → You switch: synchronous teardown of the heaviest list view + You mount + the shell-wide re-render a section change causes |

The existing `mapOpen` (first open, includes the chunk fetch) stays as-is.
Every fix below names the metric that must move; a fix that doesn't move its
metric on the PR trend comment isn't done.

First CI measurement (this PR's preview, production corpus, 4× throttle):
`mapOpen` 4982 ms, **`mapReopen` 4399 ms**, `youOpen` 114 ms. That confirms
the map diagnosis quantitatively — a *repeat* open costs ~90% of a first
open, i.e. the lazy-chunk fetch is a small slice and the recurring
Leaflet-init + marker-pipeline re-boot is nearly the whole bill (Fix 2's
target). `youOpen` measuring fast in this mobile lab run suggests the
perceived You-tab slowness concentrates in paths this first metric doesn't
own — e.g. switching *away from the Map tab* (Leaflet teardown in the same
commit, eliminated by Fix 2), lower-end devices, or the desktop persistent-
map re-render breadth (Fix 4). Watch the trend before investing in Fix 4;
if `youOpen` stays low after Fixes 1–2 land, re-profile the desktop path
before assuming the context split is still needed.

## Why the clicks are slow

All four causes live in the redesigned shell (`web/src/redesign/`):

1. **Every tab switch remounts the entire view.** `.a-content` in
   `App206.jsx` is keyed by the active section (`key={contentKey}`), so
   switching tabs unmounts the previous view's whole subtree and mounts the
   new one in a single synchronous commit. Leaving Discover tears down up to
   200 event rows plus every channel card; the browser can't paint *anything*
   — including the tapped nav button's active state — until that commit
   finishes. (The keying exists for scroll-position bookkeeping, not by
   accident; see the scroll-restore comment in `App206.jsx`.)

2. **Navigation is an urgent, blocking update.** `go()` calls a plain
   `setSection`, so React renders the entire transition at urgent priority.
   This is the same class of problem PR #835 fixed for the index swap with
   `startTransition`: the input handler hogs the main thread and first paint
   of *any* feedback waits for the full render.

3. **The Map tab pays full Leaflet boot on every visit.** Because the content
   area is keyed, leaving the Map tab unmounts Leaflet entirely. Every
   re-entry re-runs: Leaflet `MapContainer` init, `isMappable` over the whole
   events index, `groupEvents` over thousands of instances, one `Marker` per
   group (viewport culling is inert on first render — `bounds` is null until
   `ViewportTracker` reports, so *all* groups render), MarkerClusterGroup
   clustering, and tile refetches. All the `useMemo` caching inside
   `EventsMap` dies with the unmount.

4. **One mega-context re-renders the whole shell.** `App206` rebuilds the
   `model` object literal on every render and passes it through a single
   context, so any section change re-renders every consumer — TopBar,
   RailNav, BottomNav, FilterPopover, and (on desktop) the persistent
   `MapPanel`, whose `shownCount` memo is a full-index pass that recomputes
   `eventKey(e)` (a string build) per event whenever its deps shift (e.g.
   Following → You flips `feedOnly`, which also remounts the desktop cluster
   layer via its scope key).

## Staged fixes

Ordered by leverage-per-risk. Each landed as its own commit in the same PR
as this plan; UI-behavior changes ship with Playwright e2e coverage +
screenshots per AGENTS.md.

### Fix 1 — `startTransition` on section navigation (small, do first)

Wrap the section change in `go()` / `openChannel()` / `back()` in
`startTransition`, keeping the nav-highlight state urgent (either by
splitting a tiny `pendingSection` urgent state for the nav buttons, or by
relying on the transition's immediate paint of the pressed state). The tab
press then paints in the next frame while the heavy view swap renders at
transition priority — and React can interrupt it for further input.

- Moves: `youOpen` (perceived; the painted-nav-state timestamp the metric
  uses), and `tapResponse` stays honest as the mid-swap guard.
- Risk: low. Mirrors the shipped #835 pattern.
- Caveat: `startTransition` doesn't shrink the work; it un-blocks feedback.
  Fixes 2–4 shrink the work.

### Fix 2 — keep the mobile Map mounted after first open (the `mapReopen` fix)

Once the user opens the Map tab, keep the `<MapPanel mobile>` subtree mounted
for the rest of the session and toggle its visibility with CSS
(`display:none` / `visibility`), instead of unmounting through the keyed
content area. Re-entering the tab becomes a style flip plus a Leaflet
`invalidateSize()` (the existing `MapBridge` ResizeObserver already handles
that), not a re-boot.

- Preserves the mount-lazily guarantee pinned by `web/e2e/map-mount.spec.js`:
  still **no** Leaflet below desktop until the first Map-tab open, and still
  exactly one instance. That spec's assertions extend to: after navigating
  away and back, the instance count is *still* 1 (today it re-creates).
- Moves: `mapReopen` (should approach ~0 render cost), and indirectly
  `youOpen`/tab switches *away* from Map (no Leaflet teardown in the commit).
- Costs: the map keeps consuming memory in the background and its markers
  keep updating on corpus/filter changes while hidden. Acceptable — the
  desktop layout already keeps a persistent always-mounted map; if hidden
  updates show up as jank, gate marker recomputes on visibility.
- Implementation sketch: render the mobile map *outside* the keyed
  `.a-content` (a sibling shown only when `section === 'map'`), so the keyed
  scroll-restore behavior of the list views is untouched.
- **Shipped with the required harness update.** The `mapReopen` and
  `youOpen` preambles in `web/scripts/boot-profile.mjs` used to wait for
  `.leaflet-container` to become `detached` after leaving the Map tab —
  under this fix it never detaches, which would have hung every run to its
  60 s timeout. The waits now use `hidden` (hidden = not visible OR
  detached, so the harness is valid in both the old and new worlds), and
  the reopen anchor's `hidden` → `visible` transition expresses "container
  visible again".

### Fix 3 — make first marker render cheap (helps `mapOpen` and `mapReopen`)

Two independent pieces inside `EventsMap.jsx`:

- **Cull before first `bounds`.** `visibleGroups` returns *all* groups until
  `ViewportTracker` reports. Seed the cull from `INITIAL_BOUNDS` (the map
  always opens framed at the metro clamp box), so far-flung groups never
  enter the first marker build.
- **Defer markers behind the map shell.** Mount the container + tiles first
  and add the `MarkerClusterGroup` in a follow-up transition (or after first
  idle), so the "map is open" paint isn't gated on building thousands of
  markers. The `mapOpen`/`mapReopen` painted-container timestamps improve and
  match what a user perceives (tiles first, pins a beat later).

- Moves: `mapOpen`, `mapReopen`.
- Risk: medium — marker/cluster remount keys are subtle (see the scope-key
  comments in `EventsMap.jsx`); needs the map e2e specs plus a manual pass.

### Fix 4 — split the shell context (breadth reduction)

Split the single `model` context into slices with stable identities (e.g.
nav/UI state vs. derived data vs. handlers, or `useMemo` the model with
explicit deps as a first step), so a section change re-renders the views that
read `section` and not every shell consumer. Then memoize the pure chrome
(`TopBar`, `BottomNav`, `RailNav`) and precompute per-event keys once on the
index (killing repeated `eventKey` string builds in `shownCount` /
`isMappable` hot paths).

- Moves: `youOpen` (and general input latency everywhere).
- Risk: highest of the four — touches every consumer; do last, measure
  before/after with the same metrics, and keep the favorites-parity paths
  (App.jsx) untouched per the Favorites Filter Parity rule.
- **Shipped: the first step only** — the model is now built in `useMemo`
  (parent re-renders with unchanged props no longer re-render every
  consumer) and `eventKey` is memoized per event object via WeakMap. The
  full slice split is deliberately deferred: with Fixes 1–2 in, a section
  change's remaining breadth may not be worth the churn — decide from the
  `youOpen` trend, per "What fixed looks like" below.

## What "fixed" looks like

On the PR trend comment (4× throttle, production corpus): `youOpen` and
`mapReopen` under ~500 ms each, `mapOpen` under ~1.5 s, no regression in the
six boot metrics. Revisit the noise bands after two weeks of trend data, per
the boot-profiling doc's rollout note.

## Non-goals

- Desktop map-column behavior (already persistent; different cost model).
- Virtualizing the Discover list (separate effort; `EVENTS_MODE_CAP` already
  bounds it).
- Changing what the tabs render — this plan is strictly about the cost of
  getting there.
