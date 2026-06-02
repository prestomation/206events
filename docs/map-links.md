# Map links for venues and events

## Why

206.events already knows where almost everything is — venues carry a
fixed `geo` (`lat`/`lng`, a human-readable `label`, and often a precise
OpenStreetMap `osmType`/`osmId`), and every event in `events-index.json`
carries resolved `lat`/`lng` plus a `location` string. None of that was
turned into a *clickable way to get to the place*: the web UI showed
location as plain text, generated `.ics` files emitted no `GEO`, and the
discovery API exposed coordinates but no ready-made map link.

This feature adds map links across three surfaces, all driven by one
shared link-building utility.

## Shared builders

`lib/maplink.ts` (build/discovery side) and `web/src/lib/maplink.js`
(browser) are byte-for-byte mirrors — the same convention as the
haversine helper duplicated between `feed.ts` and `App.jsx`.
`lib/maplink.test.ts` and `web/src/maplink.test.js` assert identical
output for a shared fixture set; that's the parity contract.

| Function | Output |
|---|---|
| `googleMapsUrl(i)` | `https://www.google.com/maps/search/?api=1&query=<q>` — universal URL, works in every browser, deep-links into the maps app on mobile |
| `osmFeatureUrl(i)` | `https://www.openstreetmap.org/<osmType>/<osmId>` — only when an OSM identity is present |
| `geoUri(i)` | `geo:<lat>,<lng>?q=<q>` — opens the device default maps app (robust on Android); requires coordinates |
| `bestMapHref(i)` *(web only)* | Android → `geoUri`, iOS/desktop → `googleMapsUrl` |

### Landing on the business, not just a pin

The query (`q`) prefers the venue **name + address** (`label`, then the
event `location` string), falling back to bare `lat,lng` only when no
text is available. Passing the name+address makes Google Maps resolve to
the actual business listing rather than dropping an anonymous coordinate
pin. The coordinate-only fallback (rare — e.g. a neighborhood-centroid
geocode) still lands the user near the right spot.

### Provider strategy

- **Desktop / static documents / any browser:** Google Maps universal
  URL. Mobile browsers deep-link it into Maps/Apple Maps.
- **Mobile web UI:** `geo:` URI so the OS opens its default maps app.
  `geo:` is reliable on **Android**; iOS Safari ignores it, so iOS falls
  back to the Google universal URL (which iOS deep-links into the app).
- **OpenStreetMap:** when a venue has `osmType`/`osmId`, the exact feature
  link is also exposed (discovery API `map.osm`).

## Surfaces

### Web UI

A `--pin` CSS token (ceramic / map-pin red — `#d24a3d` light, `#ef6f62`
dark, in `web/src/index.css`) colors the location affordances.

- `web/src/redesign/views.jsx`:
  - the location fact in `EventDetail` is an anchor (`bestMapHref`).
  - **Source page (`ChannelDetail`)** shows a ceramic-red map pin next to
    the venue name when the channel maps to a venue with coordinates. The
    venue `geo` is carried onto the channel view-model by
    `channelFromCalendar` (`viewModels.js`) and the link is built
    client-side with `bestMapHref`, so it works off the deployed `geo`
    without depending on the venues.json `map` field.
  - **Per-event rows** (`ParsedEventRow` on the source page) render the
    shared `LocationMapLink` when the calendar is distributed — i.e. the
    event carries its own geo.
- `web/src/redesign/atoms.jsx` — `LocationMapLink` is the shared
  pin-only location affordance: muted location text followed by a small
  ceramic-red pin that is the only tap target (the text is not a link).
  Its `onClick` calls `stopPropagation` so it doesn't trigger an enclosing
  row's open-event handler. Used by both `EventRow` (the list row across
  Discover/Following, when `showLoc` is set) and `ParsedEventRow`.
- `web/src/components/EventsMap.jsx` — marker popups gain an "Open in
  maps →" link (Google universal URL, so it passes the existing http(s)
  scheme guard).
- `web/src/App.jsx` — the dead, never-called `createGoogleMapsUrl` was
  removed in favor of the shared helper.

### ICS `GEO` property
`toICS` (`lib/config/schema.ts`) emits `GEO:lat;lng` when an event carries
coordinates. `attachEventCoords` in `lib/calendar_ripper.ts` is the
**single** coordinate-resolution pass for ripper + recurring calendars: it
runs before the ICS write and attaches `lat`/`lng`/`osmType`/`osmId`/
`geocodeSource` to each event (precedence: calendar `geo` → ripper `geo` →
geocode the `location` string). The events-index builder then *reads* those
attached fields instead of resolving again.

Resolving exactly once is deliberate. `resolveEventCoords` reports a
geocode error only on the **first** encounter of an unresolvable location —
a warm-cache second call returns silently (`geocoder.ts`). A second
resolution pass would therefore drop those errors from the build report, so
the events-index no longer re-resolves; it consumes what the pre-pass
attached. This keeps the geocode-error count identical to before.

Scoped to calendars we generate (rippers + recurring); external feeds pass
their upstream `.ics` through unchanged (and external events are still
resolved inline in the events-index loop). Aggregate (`tag-*`) calendars
inherit the attached coordinates because the aggregator spreads the source
event objects.

The personal favorites feed (`infra/favorites-worker`) assembles its ICS
by merging already-generated calendar text, so `GEO` flows through the
line-based merge with no worker change.

### Discovery API (`venues.json`)
Each venue entry gains a `map: { web, osm? }` object built from its `geo`.
These are **absolute external URLs**, so they live outside the
relative-only `links` HATEOAS object (whose hrefs `linkSchema` and
`check-discovery-api.ts` require to be on-disk paths). The existing
absolute `url` field is the precedent. `events-index.json` intentionally
gets no new field — the web client computes links from the `lat`/`lng`/
`location`/`osm*` already present there, keeping the index small.

## Validation

- `scripts/check-discovery-api.ts` asserts `map.web` is an absolute
  http(s) URL and `map.osm` (when present) is an OpenStreetMap URL, and
  never crawls them as local files.
- Unit tests: `lib/maplink.test.ts`, `web/src/maplink.test.js` (parity),
  `lib/discovery.test.ts` (venue `map` fields), and `lib/config/schema.test.ts`
  (`GEO` emission).
