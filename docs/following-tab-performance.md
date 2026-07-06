# Following-Tab Performance for Logged-In Users — Improvement Plan

**Status: proposed** (plan only; fixes land as follow-up PRs, one commit per
fix, each named against the metric it must move).

Reported symptom: the site is performant in general, but for a **logged-in
user with a populated feed** (reported at 33 followed calendars, 1 geo
filter, **14 saved searches**), clicking the **Following** tab is quite slow.
Logged-out sessions don't reproduce it.

This is a different cost center from the tab-switch work in
`docs/web-tab-switch-performance.md` (which fixed the *navigation mechanics*:
`startTransition` on section swaps, Map keep-alive, model memoization). Those
fixes assume the main thread is quiet when the tap arrives. For a logged-in
user with saved searches, it isn't — and the one remaining heavyweight
main-thread consumer scales linearly with the number of saved searches.

## Why it's slow

### Cause 1 — saved-search matching runs Fuse on the main thread, per filter

The parity-locked saved-search path (`perFilterMatches`, `web/src/App.jsx`)
builds a `new Fuse(eventsIndex, …)` index over the **full corpus** and runs
one `fuse.search(filter)` pass **per saved filter**, all on the main thread.
Production scale today: **11,791 events** (6.5 MB NDJSON) plus a **1.8 MB
description dictionary** attached to the same objects — and the Fuse options
(`ignoreLocation: true`) scan every event's whole description per query.
Prior profiling of the identical live-search pass (see the worker comment in
`web/src/redesign/App206.jsx`) put it at **~120 ms per query on desktop,
several hundred ms on mobile**. At 14 saved filters that is **~1.7 s+ of
uninterruptible main-thread work per pass on desktop, and roughly 4–8 s on a
mid-range phone**.

The live search box already had exactly this problem and was moved into a
Web Worker (`docs/web-search-worker.md`, `web/src/lib/searchWorker.js`) —
with **the same Fuse options** (`SEARCH_FUSE_OPTIONS` in
`web/src/lib/searchEngine.js`: same keys, `threshold: 0.1`,
`ignoreLocation: true`). The saved-filter path was deliberately left on the
main thread at the time ("the parity-locked saved-search path is untouched")
to keep that PR's blast radius small. This plan is the follow-up.

### Cause 2 — the pass re-runs on every corpus identity change (≈6–12× per boot)

The effect deps are `[searchFilters, eventsIndex]`, both compared by
identity. During a normal logged-in boot, `eventsIndex` gets a **new array
identity** repeatedly:

1. the `events-index-soon.json` payload lands (~3k events),
2. **each** progressive NDJSON stream flush (one per 250 ms while the 6.5 MB
   stream arrives — several flushes on a fast connection, more on slow),
3. the final full-corpus commit,
4. the description-dictionary attach (`setEventsIndex(prev => prev.map(…))`),
5. and after login, the server lists fetch replaces `searchFilters` with a
   new array (usually value-identical to the localStorage copy).

Every one of those re-runs the full index-build + 14-search pass from
Cause 1. Multiply it out and a logged-in boot spends **many seconds of
main-thread time** on saved-search matching — precisely in the window when
the user taps Following (for a user with a built feed, it's the first thing
they do). `startTransition` can't help: the tap's transition render has to
wait behind whatever synchronous Fuse pass is already on the thread.

Each pass also cascades a shell-wide re-render: `setPerFilterMatches` →
`searchFilterMatchSummaries` → `eventAttributions` (a full-index pass) →
`followingGroups` (filter + dedup + regroup) → new context `model` identity
→ every consumer re-renders.

### Cause 3 — no pending state while matches compute

Until the saved-search Sets land, the Following feed silently renders
**without** the search-matched events (the effect starts from an empty map).
The user sees a partial feed that reflows seconds later with no indication
anything is still working. Slow *and* silent reads as broken.

### Cause 4 — desktop map rebuilds its marker layer on Following entry

On desktop, entering Following flips `feedOnly`, which is part of the
`MarkerClusterGroup` remount key and the `FitBounds` key in
`web/src/components/EventsMap.jsx`. The tab swap's commit therefore includes
a full marker-layer teardown + rebuild + re-fit for the feed scope. The
`mapReopen` work showed this pipeline is the expensive part of map rendering;
here it rides along on every Discover ↔ Following switch. Secondary to
Causes 1–2, but it's paid even at steady state.

## Measurement (ships first, with the plan's first PR)

Two additions to the boot-profile harness (`web/scripts/boot-profile.mjs`,
reported per-PR alongside the existing eight —
`docs/web-boot-profiling-ci.md`):

| Key | What it owns |
|---|---|
| `followingOpen` | Post-settle Discover → Following switch **with seeded personalization** (see below): tap → painted feed. The steady-state cost of entering the tab. |
| `personalizedSettle` | Sum of main-thread long-task time from navigation until the saved-search matches settle, with seeded personalization. Owns the boot-window storm (Cause 2) — the thing that makes an *early* Following tap feel dead. |

Seeding: the harness writes a representative personalization set into
`localStorage` before load — **35 favorited icsUrls, 14 saved searches
(real words that hit the corpus, e.g. "jazz", "trivia", "market"…), 1 geo
filter** — using the same `calendar-ripper-*` keys the app reads. The
anonymous localStorage path exercises the identical `perFilterMatches` /
`followingGroups` code as a logged-in session, so no auth is needed in CI.

Baseline both metrics on production data at 4× throttle before landing any
fix; every fix below names the metric that must move.

## Staged fixes

Ordered by leverage-per-risk.

### Fix 1 — move saved-search matching into the existing search worker

Replace the inline `new Fuse(…)` in the `perFilterMatches` effect with one
`searchClient.search(filter)` call per saved filter (`Promise.all`, then one
`setPerFilterMatches`). The worker already holds the same corpus the effect
indexes today (it parses/streams it, and `applyDescriptions` attaches the
same dictionary), already returns exactly the needed shape (a `Set` of
`eventKey` strings), and its engine is built from the same option literals.
The main thread never builds a Fuse index again; the dynamic
`import('fuse.js')` in `App.jsx` goes away entirely (small bundle win — the
main bundle no longer needs a Fuse path at all; the workerless fallback in
`searchClient.js` covers jsdom/CSP environments with identical semantics).

**Parity.** This path is governed by the Favorites Filter Parity rule — the
client must match `infra/favorites-worker/src/event-search.ts`. The move is
parity-*improving*: today the contract is duplicated literals in two places
(`App.jsx` constants and `searchEngine.js`); afterwards the client has a
single definition (`SEARCH_FUSE_OPTIONS`) used by both the live box and the
saved filters. Required in the same PR:

- `web/src/filter-parity.test.js` gains an assertion that
  `SEARCH_FUSE_OPTIONS` (keys, threshold, ignoreLocation) matches the
  worker-side `event-search.ts` config, and the existing shared-fixture
  tests run the client side through the **worker engine path**
  (`createSearchEngine`) instead of an inline Fuse.
- The parity table in `AGENTS.md` ("Search filters" row) is updated to name
  `searchEngine.js` as the client-side implementation.
- Keep `fuse.js` versions aligned between `web/package.json` and
  `infra/favorites-worker/package.json` (they resolve match sets — a major-
  version drift could diverge results).

Timing caveat: worker corpus updates (stream, `applyDescriptions`) are
eventually consistent with React state; a match set may briefly reflect a
slightly older corpus. The live search box already accepts exactly this, and
Fix 2 re-runs matching on corpus settle, so any skew self-heals.

- Moves: `personalizedSettle` (the multi-second main-thread block becomes
  worker time), `followingOpen` indirectly (tap no longer queues behind a
  Fuse pass).
- Risk: low-medium. No semantic change; parity tests are the guardrail.

### Fix 2 — recompute per corpus *generation*, not per array identity

Stop keying the saved-search effect on `eventsIndex` identity. Recompute at
the meaningful checkpoints only:

1. once when the soon payload lands (fast — small corpus — and gives the
   feed immediate approximate search matches),
2. once when the full stream commits (`fullEventsLoaded`),
3. once when descriptions attach (the authoritative pass — description
   matches only exist after this),
4. when `searchFilters` **changes by value** (compare a joined/sorted key,
   not array identity — the post-login server fetch usually delivers the
   identical list and should be a no-op).

Skip the per-250 ms progressive-flush identities entirely. Implementation
sketch: a corpus-generation counter (or `'soon' | 'full' | 'full+desc'`
stage tag) held in a ref/state bumped at those checkpoints, used as the
effect dep alongside the value-compared filter key. With Fix 1 in, the waste
being cut is worker CPU plus — more importantly — the **per-pass shell-wide
re-render cascade** (each `setPerFilterMatches` currently re-renders every
context consumer up to ~12× per boot).

- Moves: `personalizedSettle` (fewer passes and fewer full re-renders);
  steadies `followingOpen` variance during the boot window.
- Risk: low, but ordering-sensitive (a checkpoint firing while a prior
  worker search is in flight should supersede it — keep a request-generation
  guard like the live box's `cancelled` flag).

### Fix 3 — pending/progressive UX: never a silent partial feed

Even with Fixes 1–2 the authoritative match set arrives seconds after first
paint (it needs the full corpus + descriptions). Make the wait visible and
the feed progressively useful instead of silently incomplete:

- Track `savedSearchesPending` in `App.jsx`: true from when a recompute is
  queued/in flight until its result commits, exposed through the app model.
- The Following view renders immediately from what's computable
  synchronously — favorites membership + geo haversine (both cheap) — plus
  whatever match Sets have landed so far (the soon-corpus pass from Fix 2
  gives near-term search matches almost immediately).
- While pending, show a compact, non-blocking status row under the feed
  legend: a spinner + "Matching your 14 saved searches…". The
  "Feeding this:" search chip gets the same spinner treatment. When the
  final Sets land, the new rows merge in via the existing `startTransition`
  path and the status row disappears.
- The day-scrubber/counts recalibrate on merge; `PagedDayList` already
  resets pagination when `events` identity changes, which is acceptable here
  (the merge lands within seconds of entry, usually before deep scrolling).

Per AGENTS.md UI rules, this ships with a Playwright e2e spec (seeded
filters via `installDataMocks` + localStorage, asserting the pending row
appears and resolves) and checked-in screenshots of the pending and settled
states embedded in the PR body.

- Moves: perceived latency (the metric-visible part is `followingOpen`'s
  painted-feed timestamp, which now paints the partial feed immediately).
- Risk: low; purely additive UI.

### Fix 4 — decouple the desktop feed-map rebuild from the tab swap (measure first)

Only if `followingOpen` remains above target on desktop after Fixes 1–3.
Entering Following remounts the cluster layer + refits bounds in the same
commit as the view swap. Options, in order of preference:

- Defer the feed-scoped marker rebuild behind the swap: let the tab commit
  paint first, then rebuild markers in a follow-up transition / idle
  callback (the map shell and tiles stay up; pins re-scope a beat later) —
  the same "tiles first, pins later" pattern as Fix 3 in
  `docs/web-tab-switch-performance.md`.
- Alternatively, drop `feedOnly` from the remount key and update markers
  in place, keeping cluster state (higher risk — the scope-key comments in
  `EventsMap.jsx` document why remounting was chosen).

- Moves: `followingOpen` (desktop).
- Risk: medium — marker/cluster remount keys are subtle; needs the map e2e
  specs plus a manual pass.

## What "fixed" looks like

On the PR trend comment (4× throttle, production corpus, seeded
personalization): `followingOpen` under ~500 ms (same bar as `youOpen` /
`mapReopen`), `personalizedSettle` reduced to roughly the anonymous boot's
long-task total (saved-search matching contributes ~0 main-thread time), no
regression in the existing boot metrics, and `filter-parity` tests green
throughout. Subjectively: tapping Following right after load paints the
calendar/geo feed instantly with a visible "matching your searches…" row
that resolves within a few seconds.

## Non-goals

- Changing filter *semantics* or the favorites-worker (`infra/`) — the ICS
  feed and its Fuse pass are server-side and not part of this symptom.
- Virtualizing the Following list (`PagedDayList` already pages 60 rows at
  a time; list rendering is not the bottleneck).
- Caching match sets across sessions (IndexedDB etc.) — revisit only if the
  post-fix `personalizedSettle` still feels slow on phones; it adds
  invalidation complexity (corpus generation pairing) for a window Fixes
  1–3 should already cover.
- The mobile Map tab's scope toggle (keep-alive already covers re-entry).
