# Keeping your place: scroll restoration across back-navigation

## Problem

Browse down the Discover → **Events** list, open an event to read it, then go
back to keep browsing — and the list has jumped. You lose your place on every
event you look at, which makes the site tedious to browse.

A per-view scroll map already existed in `App206.jsx`, and a regression spec
already covered the flow, so the bug looked fixed. It wasn't: the spec used
exactly 60 events (one page) and a target halfway down it, which is the one case
that worked. Four separate things broke the rest.

## Why it broke

`.a-content` is the only scroll container (`.app206` itself is
`overflow: hidden`), and it carries `key={contentKey}` — so opening an event
unmounts the entire list subtree and mounts a fresh container at scrollTop 0.
Everything below follows from that.

### 1. The page window resets, so the offset is silently clamped

`PagedDayList` renders `events.slice(0, visibleCount)`, starting at
`EVENTS_PAGE_SIZE` (60) and growing a page at a time as an IntersectionObserver
sentinel scrolls into view. `visibleCount` was component-local state, so the
remount started over at 60 rows.

Assigning an offset larger than a container's scrollable range is **not an
error** — the browser silently clamps it. Page down to ~300 rows (~25 000 px),
open an event, come back to 60 rows (~5 000 px), and `el.scrollTop = 25000`
lands at ~4 000 px. No exception, no warning, just the wrong place.

### 2. The clamped value was then saved over the real one

The old code assigned `scrollTop` and *then* attached the `scroll` listener. The
browser dispatches that assignment's scroll event a frame later, so the listener
recorded whatever the clamp produced — overwriting the genuine offset. The first
failed restore destroyed the information needed to ever recover.

### 3. Some content arrives after mount

A venue/channel page renders events parsed live from its ICS, fetched *after*
the view mounts. A one-shot mount-time restore always runs against an
effectively empty page there.

### 4. One key for every event, one for every channel

The map was keyed `'ev'` / `'ch'` / `<section>`, so every event detail shared a
slot and every venue page shared another. Restoring one venue page's offset onto
a different venue page is worse than not restoring at all.

## How it works now

### `web/src/redesign/useViewScrollRestore.js`

Owns the scroll map and the restore. Three things beyond a plain assignment:

- **Per-view keys.** `ev:<eventKey>`, `ch:<icsUrl>`, or the section name.
  Deliberately *finer* than the React `key` on `.a-content`, which stays coarse
  so navigating between two events doesn't remount the container.

  That gap is why the offset is assigned **even when it's zero**: moving between
  two events (an "Other dates" or "More from" row on a detail page) reuses the
  same DOM node, so without an explicit write the second event would open still
  scrolled to the first one's position.

  The map is capped at 50 entries and evicts least-recently-written.
- **A pending-restore guard.** While a restore is in flight the scroll listener
  records nothing, so a clamped echo can't overwrite the saved offset (#2).
- **Chase-while-growing.** If the first assignment lands short, re-apply on each
  animation frame while `scrollHeight` is still changing. It stops on any of:
  the offset is reached; the content arrived and *then* held a stable height for
  ~30 frames; the reader takes over; or a 3 s backstop. That backstop is short
  on purpose — a restore that fires seconds after the reader has settled is a
  page that jumps under them, which is worse than not restoring, so a venue page
  whose ICS takes longer than that simply stays at the top. It only touches
  `scrollTop` when the scrollable range can actually
  hold the offset — otherwise each frame would be a write plus a read-back, i.e.
  a forced reflow, for an assignment guaranteed to be clamped away.
- **Yielding by outcome, not by input event.** Every position the hook writes is
  recorded, so anything else the container ends up at came from the reader —
  wheel, touch, keyboard, a scrollbar drag, the day scrubber, anything. Guessing
  from input events fails at both ends: native scrollbar drags dispatch no
  pointer events at all in Chromium, while `pointerdown` and `touchstart` fire
  for every tap on a button or link, where yielding (and recording a
  still-clamped offset) would destroy the saved position outright. `wheel` is
  still listened for as a fast path — it arrives before the scroll it causes and,
  unlike a tap, means nothing but scrolling.
- **Ignoring the browser's own scroll resets.** Swapping what the container
  holds — Discover's Events list for its much shorter Calendars grid — makes the
  browser move `scrollTop` itself: Chromium clamps to the new maximum, Firefox
  zeroes it outright, and both dispatch a scroll event synchronously with the
  DOM change, before the outgoing view's listener is detached. Recorded, that
  wipes the position the reader left. The tell is a single event jumping more
  than a screen upward, landing exactly on a limit, and following no input;
  real scrolling walks there, so the event before the top is already near the
  top. Recent input (a keypress, tap or wheel within 300 ms) vetoes it, since a
  keyboard Home *does* move in one step. The comparison is against every
  position the container passed through, recorded or not — otherwise one skipped
  event leaves a stale baseline that swallows the next one too.

  Discover's two modes also get separate keys (`discover:events` /
  `discover:calendars`) rather than sharing one, since their lengths differ by
  an order of magnitude.

  Both halves of the stability rule matter. A bare "height stopped changing"
  check aborts during the flat period *before* content arrives — a venue page's
  height doesn't move for as long as its ICS fetch takes, which is exactly the
  case the chase exists for. And giving up must not write the clamped position
  back: the saved offset is left intact so a later, taller visit can still
  honour it.

### `web/src/redesign/views.jsx`

`PagedDayList` parks its page window in a module-scope `pageWindows` map keyed by
a `restoreKey` prop (`discover-events`, `following`) and seeds `visibleCount`
from it **during render**, via the `useState` initializer.

Rendering — not an effect — is what makes this work: React runs child layout
effects before the parent's, so the rows are already committed to the DOM by the
time `App206`'s restore reads the container height. The common case then settles
on the first assignment and never touches the chase loop above.

The counterweight is the reset. `visibleCount` must still drop to one page on a
*genuine* list swap — a filter edit, the soon→full index swap, saved-search
matches landing — so the reader isn't left deep inside a list they didn't ask
for. That effect is guarded by a `useRef` holding the previous **signature**
(not array identity: `App.jsx` republishes `perFilterMatches` as a fresh Map on
every corpus checkpoint, which cascades into a brand-new array with identical
contents in the Following feed), so it fires when the list really changed but
not on mount, where it would throw away the window just restored. When it does
fire it re-seeds the saved page window at one page *and* calls
`resetViewScroll(scrollKey)` so the stale offset goes with it.

It re-seeds rather than deletes on purpose: `setVisibleCount(EVENTS_PAGE_SIZE)`
bails out when the count is already one page, so the persist effect never re-runs
to replace a deleted entry — and a missing entry reads as "never visited" on the
next mount, skipping the staleness check below entirely.

That covers a swap made **while the list is mounted**. The search box and date
filter stay usable on a detail page, though, so the reader can also change the
result set while the list is *unmounted* — and the effect above can't see that,
because its "before" is whatever array the remount started with. A plain
identity check is no help either: a remounted `useMemo` produces a fresh array
whether or not anything changed.

So each stored window carries a **signature** — the list's length plus its first
and last `eventKey`. On mount, a saved window whose signature no longer matches
is discarded, and a layout effect calls `resetViewScroll(scrollKey)` to drop the
offset with it. It has to be a *layout* effect: the parent's restore runs in the
same commit's layout phase, after the child's, so clearing here lands the new
list at the top. Without it the chase would actively drive the reader thousands
of pixels into a result set they never scrolled, as pagination grew the new list
past the old offset.

`resetViewScroll` takes the key rather than inferring "the current view".
Neither ordering works for both callers — the mount-time one runs before this
hook's effect, the mounted-swap one after — so callers pass the key they read
from context during their own render. That is safe under `startTransition`:
effects only run for renders that commit, so the value an effect closes over is
a committed one.

It also puts the container back at the top, not just forgetting the offset.
When the swap happens while the view is mounted, the container is still sitting
at the old position, and a shorter result set merely clamps it — parking the
reader at the *bottom* of a list they never scrolled.

### Accepted trade-off: the restored window is uncapped

The window is seeded on **every** mount, not only back-navigation, so returning
to Discover from another tab also re-commits however many rows the reader had
paged to. A day-scrubber drag deep into the timeline can set `visibleCount` to
most of the list (`grow` in `useDayScrubberSeek`), so that commit can be large —
where it used to be a flat 60 rows.

A cap was tried and removed. Beyond the cap the offset is out of reach on the
first try and the list has to page back up to it one `EVENTS_PAGE_SIZE` step per
IntersectionObserver firing; measured against a 500-event fixture that took over
15 s to walk back 200 rows. Trading a correct restore for a visibly slow one is
the wrong way round, and it degrades exactly the deep-reading case this work is
about.

What's left is bounded by the fact that the reader already paid the same render
once, while browsing, and navigation renders inside `startTransition` (Fix 1 in
`docs/web-tab-switch-performance.md`) so React can yield rather than block the
tap. If the boot-profile numbers ever show this as real, the fix is to seed the
window inside a transition — not to cap it.

## Where "back" goes

Restoring the position only helps if "back" lands on the right view in the first
place, and it didn't. An event detail replaces the venue page it was opened
from, so the arrow has two plausible destinations — and it always took the same
one: `back()` cleared both overlays and dropped to the section. Browser Back
meanwhile popped the hash and *did* return to the venue, so the two disagreed
about what the reader had just done.

`App206.jsx` now records the open venue when an event is opened from one, and
the next `back` consumes it — once. `openChannel` and `go` clear the record, so
a venue's own back arrow still goes to the section rather than bouncing into the
venue it just came from.

Two subtleties, both load-bearing:

- The `openCh` mirror that recording reads is written from an **effect**, never
  during render. Navigation runs inside `startTransition`, and a render-phase
  write survives a discarded transition render — the same hazard the map
  keep-alive latch documents.
- The target is recorded only when arriving at a detail from something that
  isn't one. Two things otherwise clear it wrongly, and both look like "open
  this event" from inside `openEvent`: writing the hash fires a `hashchange`,
  which `useUrlState` applies straight back, re-opening the event already on
  screen; and "Other dates" / "More from" hop sideways between details without
  passing through the venue. In both, the venue is already closed, so reading it
  then would record `null` over the way out.

The rule this settles on is that the arrow leads back to the **surface the
reader was browsing** — the venue, or the list — rather than to the previous
card. A chain of "Other dates" hops still exits to the venue in one tap; browser
Back walks the chain card by card, which is what it is for.

## What this does not change

- Nothing is persisted to `sessionStorage` or any other browser storage. The map
  is in memory for the session, so a reload starts fresh — deliberate, per
  `docs/privacy-and-consent.md`. A return target is navigation state in the same
  spirit: a reload drops it and the arrow falls back to the section.

## Tests

`web/e2e/scroll-position.spec.js` (chromium + firefox):

- single-page list, in-app back — the narrow case that already worked;
- 200-event list paged past the first window, in-app back — #1/#2;
- the same via the browser Back button;
- a venue page whose list is parsed from ICS after mount, returning by the
  in-app arrow and by browser Back — #3;
- a *different* venue page starts at the top rather than inheriting the last
  one's offset, and a second event opened from a detail page starts at the top
  even though the container is reused — #4;
- editing the search while reading an event leaves the list at the top, as does
  narrowing it while the list is on screen (which otherwise clamps to the
  bottom);
- Discover's Calendars and Events modes keep separate positions.

`web/src/redesign/pagedDayList.test.jsx` pins the page window itself: it
survives a remount, stays separate per `restoreKey`, never seeds beyond the
list's length, resets (dropping the saved scroll) when the list is replaced —
whether that happens while mounted or while away — and is *kept* when the same
list is merely rebuilt with a fresh array identity.

`web/e2e/event-navigation.spec.js` pins where the arrow lands: back to the venue
from an event opened on one, back to the list from an event opened there, back
to the venue still after hopping sideways between events, and back to the
section from a venue's own arrow even after a return target has been recorded
and consumed.

Screenshots: `web/e2e/screenshots/scroll-restore-deep-list.png` (scrolled deep
before opening an event) and `scroll-restore-after-back.png` (the same place
after returning).
