# Deep Linking (App206 URL state)

The redesigned web UI (`web/src/redesign/App206.jsx`) keeps its navigation and
filter state in the URL hash so that views are shareable, bookmarkable, and the
browser back/forward buttons walk the user's in-app path. Before this, `App206`
owned all of that state locally and never touched the URL — only the legacy
(now-removed) `App.jsx` hash code did, and it drove dead state.

## Where it lives

- **`web/src/redesign/urlHash.js`** — pure, DOM-free codec: `serializeHash(state)`
  and `deserializeHash(hashString)`. Operates on plain string tokens so it can be
  unit-tested without React or a browser (`urlHash.test.js`). Uses
  `URLSearchParams`, which percent-encodes special characters (`|`, `&`, `#`,
  spaces, unicode) on both write and read.
- **`web/src/redesign/useUrlState.js`** — the hook `App206` calls once. It adopts
  `App206`'s existing `useState` values + setters + nav handlers and does the
  bidirectional sync. It introduces **no new state**.
- **`web/src/redesign/App206.jsx`** — seeds the synchronously-resolvable state
  (`section`, `dateScope`, `emphasis`, `query`, `category`, `neighborhood`) from
  the hash via lazy `useState` initializers, then calls `useUrlState`.

## Hash schema

`URLSearchParams` over the hash. Read precedence mirrors `App206`'s content
cascade (**event > channel > section**). All-default state serializes to an empty
hash (a clean pathname, no dangling `#`).

| Param | State | Omitted when |
|---|---|---|
| `section` | `section` (`discover`/`following`/`you`/`map`/`health`) | `discover` |
| `event` | `openEventObj` → `eventKey` (`summary\|date`) | no event open |
| `channel` | `openCh` (icsUrl) | no channel open; ignored if `event` present |
| `q` | `query` | empty |
| `category` | `category` (tag) | null |
| `hood` | `neighborhood` (tag) | null |
| `date` | `dateScope` (`today`/`weekend`) | `all` |
| `emphasis` | `emphasis` (`events`) | `calendars` |

`section=health` has no overlay, so `event`/`channel` are dropped for it.

## How the sync works

**Outbound (state → hash).** An effect serializes the current state on change.
`section`/`openCh`/`openEventObj` changes **push** a history entry (so back/forward
works); filter/search-only changes **`replaceState`** (so per-keystroke churn
doesn't pollute history). The `query` write is debounced. The very first run is
skipped so a cold-load deep link survives until the resolver opens its overlay.

**Inbound (hash → state).** `hashchange`/`popstate` listeners deserialize and
apply via the `App206` handlers (`go`/`openChannel`/`openEvent`/`back`) and the
filter setters. A `popstateJustFiredRef` flag skips the trailing `hashchange` that
browsers fire after `popstate` for history navigation.

**Echo suppression without a flag.** After an inbound apply sets state, the
outbound effect re-serializes it, finds it equals the current hash, and no-ops.
That equality check (`window.location.hash.slice(1) === hash`) is the entire echo
guard — there is deliberately no time-based "applying from URL" flag, because a
macrotask reset races with React's synchronous effect flush and would suppress
legitimate concurrent user navigation.

**Cold-load resolution.** `openCh`/`openEventObj` can't be seeded synchronously —
the channel/event objects don't exist until `eventsIndex`/`calendars` load. A
resolver effect keyed on data arrival reads the hash captured at first render
(`initialTokensRef`) and opens the event (matched by `eventKey`) or channel once
data is present. A stale id silently drops to the underlying section view; the
next outbound write then cleans the dead param out of the URL.

## Sharing

`ChannelDetail` and `EventDetail` (`web/src/redesign/views.jsx`) each expose a
**Copy link** button that copies `window.location.href` — already the correct deep
link, since opening the overlay wrote the hash. This is distinct from the existing
**Subscription link** button, which copies the ICS feed URL.

## Out of scope

Social/Open Graph previews are not implemented: the site is a static SPA, so
per-event `og:` meta tags would require server-side rendering (a Cloudflare Pages
Function). Shared links work and unfurl with the generic site card.
