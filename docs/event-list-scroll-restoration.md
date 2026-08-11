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
  so navigating between two events doesn't remount the container. The map is
  capped at 50 entries and evicts least-recently-written.
- **A pending-restore guard.** While a restore is in flight the scroll listener
  records nothing, so a clamped echo can't overwrite the saved offset (#2).
- **Chase-while-growing.** If the first assignment lands short, re-apply on each
  animation frame while `scrollHeight` is still changing. It stops on any of:
  the offset is reached; the height has been stable for ~30 frames (the view is
  genuinely shorter now — a filter narrowed it); the reader takes over
  (`wheel` / `touchstart` / `keydown`); or a 15 s backstop.

  The give-up signal is deliberately *content stopped growing*, not a timeout —
  a venue page's height stays flat for as long as its ICS fetch takes, which can
  be seconds, and a wall-clock deadline gives up on exactly the case that needs
  the chase most.

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
for. That effect is guarded by a `useRef` holding the previous `events`, so it
fires on identity changes but not on mount, where it would throw away the window
just restored. When it does fire it clears the saved page window *and* calls
`resetViewScroll()` so the stale offset goes with it.

## What this does not change

- The in-app back arrow on an event detail returns to the **section**
  (Discover), not to the venue page an event was opened from — `back()` clears
  both overlays. Browser Back pops the hash to the venue entry and does return
  there. That asymmetry predates this work and is left as-is.
- Nothing is persisted to `sessionStorage` or any other browser storage. The map
  is in memory for the session, so a reload starts fresh — deliberate, per
  `docs/privacy-and-consent.md`.

## Tests

`web/e2e/scroll-position.spec.js` (chromium + firefox):

- single-page list, in-app back — the narrow case that already worked;
- 200-event list paged past the first window, in-app back — #1/#2;
- the same via the browser Back button;
- a venue page whose list is parsed from ICS after mount — #3;
- a *different* venue page starts at the top rather than inheriting the last
  one's offset — #4.

`web/src/redesign/pagedDayList.test.jsx` pins the page window itself: it
survives a remount, stays separate per `restoreKey`, never seeds beyond the
list's length, and resets (dropping the saved scroll) when the list is replaced.

Screenshots: `web/e2e/screenshots/scroll-restore-deep-list.png` (scrolled deep
before opening an event) and `scroll-restore-after-back.png` (the same place
after returning).
