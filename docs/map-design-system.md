# The map surface, on the design system

How the map's pins, popups and floating chrome are built, and why they are
shaped the way they are.

The source of the design is the owner's Claude Design project **206.events
Design System**, whose `map/` family works out a labelled pin, a shared popup
shell in three layouts, an event card, a venue card, date lists at two
densities, a series row, a follow pill and an attribution chip. This document
records what was ported, what was deliberately changed on the way in, and what
was left out.

## What the port kept, and what it dropped

**Kept:** structure, the type scale, spacing, geometry, component
decomposition, and the content model (a pin is a place; picking a date is a
selection; provenance is a chip, never a filter).

**Dropped: the palette.** The design system's `colors_and_type.css` documents a
cool Bootstrap ramp (`--color-primary: #007bff`, `--bg-primary: #f8f9fa`). That
is a reverse-engineering of this app's *legacy* `:root` layer
(`web/src/index.css`), not of the product people actually see, which is the
`.app206` redesign on a warm paper palette (`--paper: #faf8f4`,
`--ink: #1a1a2e`, `--line: #e9e4da`, `--blue: #1366d6`, `--pin: #d24a3d`). The
design system is a generation behind on colour, so **code wins**: every ported
rule resolves to the app's own tokens.

### Token bridge

Design-system names were rewritten to app names at port time rather than
aliased. Aliasing would have been a trap: `--bg-surface`, `--text-primary`,
`--color-primary`, `--border-color` and friends **already exist in the global
`:root`** bound to the Bootstrap values, and components that read them
(`HealthDashboard`, `GeoFiltersSection`) render *inside* `.app206`. An alias
layer leaves the codebase one selector-scope slip away from silently rendering
`#007bff`, with no test that could catch it. Rewritten, a rule that escapes its
scope renders *nothing* — a loud failure instead of a wrong one.

| Design system | App |
|---|---|
| `--bg-surface` / `--bg-muted` / `--bg-muted-hover` | `--surface` / `--surface-2` / `--surface-3` |
| `--bg-primary` (page ground) | `--paper` |
| `--text-primary`, `--text-heading` | `--ink` |
| `--text-secondary` / `--text-muted` / `--text-placeholder` | `--ink-2` / `--ink-3` / `--ink-4` |
| `--border-color` / `--border-color-strong` | `--line` / `--line-2` |
| `--color-primary` | `--blue` |
| `--tone-primary-bg` / `--tone-primary-ink` | `--blue-soft` / `--blue-ink` |
| `--tone-neutral-bg` / `--tone-neutral-ink` | `--surface-2` / `--ink-2` |
| `--bg-primary-subtle` | `--blue-soft` |
| category colour | `--c-music` … `--c-community`, via `channelColor(tags)` |

Type, spacing, radii and motion tokens already matched one-for-one and are
reused as-is.

**Genuinely new tokens** live on `.app206`: eleven `--map-*` dimensions plus
`--map-shadow` / `--map-shadow-up`, and three `color-mix` tints
(`--free-soft`, `--danger-soft`, `--pin-soft`) derived from hues the warm
palette already carries, so each follows its base token into dark mode. **No
new hex literal was introduced.**

## CSS classes, not the design system's inline styles

The design system authors these components with inline styles, for portability
between projects. That does not survive the port, for reasons that are not
stylistic preference:

1. A Leaflet `divIcon` is raw DOM outside React and cannot carry inline styles
   at all, so the pin **must** be class-driven. Splitting the family across two
   approaches would be worse than picking one.
2. The design system fakes `:hover` with `useState` on every row and pin. That
   is a React re-render per pointer-enter, on the layer that can least afford
   it.
3. `@media (pointer: coarse)`, `prefers-color-scheme` and the sticky month
   divider have no inline equivalent — and the repo's Playwright specs assert
   with class locators.

Inline styles are kept only for genuinely per-instance values: the category
gradient on the artwork square and its size, matching the precedent already in
`views.jsx`.

Everything lives under `.app206` with no `var(--token, #fallback)` doubles. The
map only ever mounts inside that tree, and `App.jsx` renders `<App206>`
unconditionally, so the fallbacks the old panel carried for a legacy unscoped
UI are vestigial — and are exactly how a stray rule would have resolved to the
Bootstrap layer.

## A pin is a place

The load-bearing behavioural change. `groupEvents` (`lib/event-grouping.js`)
buckets by venue **and source feed**, so three different shows at Neumos — or
one show listed by two feeds — used to be three markers stacked on one dot.
`groupByVenue` adds a second pass keyed on the quantized coordinate **alone**:
dropping `icsUrl` is the point, since a venue is a place and which feed
published a show is not part of its identity.

- A pin hosting **one** series opens straight into its event popup. There is no
  list worth showing, and nothing to go back to.
- A pin hosting **several** opens the venue popup; picking a series drills in
  with a back affordance, and its siblings appear as "Also at …". Escape steps
  back one level before it closes.

This also cuts the marker count, which is what makes a labelled pin viable at
all: a venue name is short and stable, an event title is neither.

**Following is per-calendar in this app**, not per-venue. An event popup
follows the clicked series' own calendar. A venue popup offers a venue-level
pill only when every series there comes from one feed; when they span several,
there is no single thing to follow, so the pill is omitted and each series row
leads to a popup where following means exactly one calendar.

### The key is coordinate **plus the name the events give the place**

The coordinate alone is not enough, and getting this wrong produced a real bug.
A source with a ripper-level `geo` stamps that **one point** on every event it
publishes. `discover-slu` is an aggregator: its 43 events all carry its office
coordinate but actually happen at 17 different places — MOHAI, REI, The
Spheres, The Center for Wooden Boats, Tapster. Keyed on the coordinate alone,
the whole neighbourhood collapsed into a single pin named after whichever
`location` string happened to be modal, so the South Lake Union Farmers Market
was filed under "The Behnke Family Gallery".

So the key is the quantized coordinate plus `venueNameKey(location)` — the
leading segment of the location string, lowercased, with a leading "the" and
punctuation dropped. Events at one dot are one venue **only when they agree
about where they are**, or when none of them says.

That still merges across feeds, which was the point of dropping `icsUrl`:
"Seattle Center, 305 Harrison St" and a bare "Seattle Center" in another feed
normalize to the same token. On the live corpus this takes 5,687 series to
1,299 venues, and the widest are genuine — Tractor (92 series), Neumos (77),
The Showbox (75).

### Venue name and address

The event's own `location` leads; `venues.json` **enriches, never overrides**.
That order is what the `discover-slu` bug teaches twice over: a `venues.json`
entry describes the SOURCE's single declared point, so letting it win would
label The Spheres "Discover South Lake Union". `venues.json` also only covers
sources whose declared `geo` is non-null (`lib/discovery.ts`), so a
venues-first path would leave most pins unlabelled anyway.

`resolveVenueIdentity` (`components/map/venueIdentity.js`) therefore:

1. Keeps the name the events give, whenever they give one.
2. Falls back to the entry's `friendlyName` when they give nothing, or give a
   **bare street address** — which 102 of this repo's 171 recurring sources do.
   That is the Georgetown Trailer Park Mall case: `location` is
   `5805 Airport Way S`, and the source's own name is plainly better.
3. Takes `geo.label` as the street address only when the entry names the same
   place, so an aggregator's address never lands under someone else's name.

**The pin and the popup share this resolver.** They must: the pill's whole
premise is that a venue name is short and stable, and an earlier version that
split `venue.label` itself put "5805 Airport Way S" on the pin while the popup
it opened said "Georgetown Trailer Park Mall".

## The pin, and the label budget

`MapPin` is a pill up to 190px wide. That cannot be the default:
`MarkerClusterGroup` already bounds how many leaf markers exist, but a
screenful of overlapping pills is unreadable regardless. So the label is
**budgeted** (`components/map/pinIcon.js`):

- `PIN_LABEL_MIN_ZOOM = 14` — far enough in that pins are spatially separated.
- `PIN_LABEL_MAX_VISIBLE = 14` — few enough on screen that labels don't collide.
- The **selected** pin is labelled at any zoom, whatever the budget says.

Both are named constants: tightening to selected-only is `PIN_LABEL_MAX_VISIBLE
= 0`. The viewport pass computes the padded count (what renders) and the
unpadded count (what the budget reads) in one loop.

### Why the icon is built, not templated

The label is source text. Leaflet 1.9's `DivIcon` accepts an `HTMLElement` for
`html`, so the pill is assembled with `document.createElement` and the name set
via `textContent`. There is no HTML string, so there is nothing to escape and
no way to get the escaping wrong. `createIcon` also runs only when a marker
actually enters the map, so nothing is constructed for one the cluster layer
swallows.

`iconSize` stays honest (rather than letting CSS size an unmeasured box) so
clustering and spiderfy can reason about the marker. Because a labelled box is
190px wide and mostly empty, `pointer-events` is **off** on the box and **on**
for the pill — a click on the pill still bubbles through to Leaflet's listener,
while the empty margins don't swallow taps meant for the map.

Clusters were restyled to read as the same object at another scale: same
surface, same hairline, same mono count, with **size as the only density
signal**. The previous green/amber/red ramp said "warning" about a perfectly
healthy dense neighbourhood, and had no dark-mode values at all.

## Layouts

| Surface | Layout | Why |
|---|---|---|
| Mobile | `sheet` | The draggable bottom sheet; the design system's "compact" density |
| Desktop map column | `panel` | Docked right, full height |
| Expanded full-screen map | `wide` | Two columns — but only where there are two columns' worth |

`VenuePopup` **declines** `wide`: its content is one list, and splitting it
strands a header and two buttons in a column of nothing. The design system's own
rule — *"Don't pad screens out with filler"* — points the same way.
`EventPopup` does have two columns' worth (copy and the next date on one side,
every date and the venue's other series on the other), so `wide` earns its keep
there.

**Floating chrome yields to an open popup.** In the ~410px docked column a
412px card leaves ~45px, which is no room for a bar at all, so `.a-mapbar` and
`.a-mapfilter` stand down and the popup *is* the panel; closing it brings them
back. Expanded to full screen there is real room, so the bars just retreat
beside the card. Without this, "Save this area" and the expand toggle were
unreachable for as long as a pin was open.

## Bugs this port fixed

- **`panInside` never panned.** Leaflet reads `paddingTopLeft` /
  `paddingBottomRight`; the old code passed `paddingTopRight` /
  `paddingBottomLeft`, which Leaflet silently ignores. A clicked pin simply
  stayed behind the panel it had just opened. The dock edge is now read from
  the committed popup's class (a popup may shell itself differently than the
  layout it was handed), and the pan is skipped entirely when the card leaves
  no usable strip of map to pan into.
- **The mobile map had no map ref at all** (`mapRef={undefined}`), so it could
  never pan. It has its own ref now, separate from the shared desktop one.
- **`PANEL_WIDTH = 340`** was a hand-maintained duplicate of a CSS width with a
  comment asking future readers to keep them in sync. The pan measures the
  popup that actually committed.
- **The map bar sat under Leaflet's zoom control** (controls are z-1000),
  clipping "6 EVENTS / Near you" to "EVENTS / ear you".
- **A venue popup on the expanded map hid the map chrome behind itself.** The
  CSS shifted the floating bars left, assuming the `wide` card; a venue declines
  `wide` and docks right, so the bars landed straight back under it. `popupShell`
  now makes that call once and both the popup and the panel read it.
- **Escape fired two handlers at once** — collapsing the expanded map (or
  closing the lightbox) *and* the popup underneath, in one press.
- **A popup opened during load froze on that generation.** `eventsIndex` is
  replaced several times after first paint, so the description the sheet
  reserves space for never arrived. The open venue is re-reported whenever the
  corpus rebuilds.
- **Opening a popup re-iconed every visible marker.** Icons are memoized apart
  from the selection, so only the selected pin's icon identity changes.
- **Attribution chips didn't theme.** The legacy emoji `AttributionChips`
  hardcoded `#e3f2fd` / `#e8f5e9` / `#f3e5f5` with no dark-mode values. It is
  deleted; the map renders the app's own `ProvChip`, so there is one attribution
  chip rather than two.
- **Dead code**: `.map-popup-image` and its delegated lightbox listener both
  referenced an `EventsMap.renderPopupHtml` that had not existed for some time.

## Where the state lives

Selection (`{ venue, group?, selected? }`) lives in `MapPanel`
(`redesign/shell.jsx`), not in `EventsMap`. That is deliberate: following a
calendar or picking a date re-renders the popup while `EventsMap`'s props stay
referentially identical, so React skips the whole memoized marker subtree.
`EventsMap` only reports which venue was clicked and takes a `selectedVenueKey`
string back.

Everything under `components/map/` is pure and prop-driven; `MapPopupHost` is
the single seam that knows about app state, and `MapPanel` feeds it. That keeps
the family unit-testable in jsdom without a provider.

## Files

- `web/src/components/map/` — `MapPopup` (+`Rule`, `MapMedia`), `EventPopup`,
  `VenuePopup`, `EventDateList`, `SeriesRow`, `MapFollowPill`, `MapButton`,
  `MapChips`, `MapPopupHost`, `pinIcon.js`, `sheet.js`
- `web/src/lib/event-grouping.js` — `groupByVenue`
- `web/src/lib/eventCadence.js` — `relativeDay`, `cadence`, `sharedTime`
- `web/src/lib/dateFormat.js` — `eventDateParts`, `localDayIndex`
- `web/src/index.css` — the `--map-*` tokens, and the `.mp-*` / `.mpin*` blocks
- `web/e2e/map.spec.js`, `web/e2e/map-popup.spec.js`

`cadence` appends a start time only when **every** instance agrees on one:
`groupEvents` deliberately merges a matinee with an evening showing, so printing
either as "the" time would be a confident lie. Day arithmetic runs on a
whole-day counter built from local calendar fields, so a weekly run still reads
"Every Thursday" across a DST boundary that a raw millisecond diff gets wrong by
an hour.

## Not done

- `MapIcon` was not ported. Several of its paths are byte-identical to the app's
  existing `Ico` (`redesign/icons.jsx`), which is used instead.
- The global `.btn` / `.a-seg` / `.a-iconbtn` atoms were **not** retrofitted to
  design-system geometry. The tighter button lands as `.mp-btn` inside the popup
  namespace only; retrofitting the shared atoms would touch every screen in the
  app.
- `backdrop-filter` stays on both floating bars, against the design system's
  `SKILL.md`. That rule targets content surfaces, and the blur is what makes a
  floating bar readable over map tiles.
- The legacy `:root` token layer is untouched. It is dead while every rule stays
  scoped under `.app206`, but unpicking it is its own change.
