---
name: "Magnuson Park Gallery"
status: added
platform: WordPress (The Events Calendar / Tribe Events)
url: https://www.magnusonparkgallery.org/events/
tags: [Arts]
firstSeen: 2026-07-19
lastChecked: 2026-07-19
pr:
---

Building 30, Magnuson Park (7448 63rd Avenue NE, Seattle, WA 98115) —
studio/gallery space run by Sand Point Arts and Cultural Exchange (SPACE),
home to 30+ resident artists.

Investigated 2026-07-19:
- Confirmed WordPress with The Events Calendar (Tribe Events) plugin —
  the real ICS export works: `https://www.magnusonparkgallery.org/events/?ical=1`
  returns a valid `VCALENDAR` with a concrete dated `VEVENT`
- Cross-checked against the list view's embedded schema.org JSON-LD
  (`/events/list/`) — matches: only 1 upcoming event, "Building 30 West
  Open Art Studios", Dec 6 2026, 12–4pm, at the venue address above
- The event page describes this as a "biannual event", and the venue's
  past-events list (`?tribe-bar-date=2025-01-01`) shows a real history of
  ~10 events, so the pipeline itself is proven — there's just only one
  concrete future date published right now
- Geocoded via Nominatim structured query on the exact street address
  (house-level match, `place_id 414185946`) — no confident OSM
  node/way for the gallery itself was found, so `osmType`/`osmId` were
  left unset for the geo-resolver skill to fill in later

Implemented via `sources/external/magnuson-park-gallery.yaml` (ICS feed,
`sourceRole: venue`, tag `Arts`). Verified with
`ONLY_SOURCE=magnuson-park-gallery npm run generate-calendars`: 1 event,
0 errors, not flagged in `newZeroEventSources`. Note for future
maintainers: because the one currently-published event is ~4.5 months
out, it won't appear in tag aggregates or `events-index.json` until the
build's 3-month external-calendar window reaches it (~September 2026) —
this is normal windowing behavior (`lib/tag_aggregator.ts`
`parseExternalCalendarEvents`), not a broken pipeline; the per-calendar
`.ics` file itself has the event today.
