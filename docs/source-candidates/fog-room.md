---
name: "Fog Room"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/fog-room-seattle-121073963359
tags: [Nightlife, Downtown]
firstSeen: 2026-08-18
lastChecked: 2026-09-01
pr: TBD
---

**Fog Room** — rooftop bar/restaurant at 1610 2nd Ave, Downtown Seattle
(The Charter Hotel). Hosts a recurring Sunday "Drag Brunch" plus occasional
themed nightlife events ("BLANC: A Rooftop Sipscape All-White Affair").

Investigated 2026-08-18:
- `/events/` is server-rendered HTML (curl fetch returns full event cards,
  no JS execution needed) — event cards embed title, date (`Sunday Aug, 2`
  style text, no year), description, image, and a per-event detail link
  (`/events/drag-brunch-4/`) directly in the initial HTML response.
- Site runs on ProcessWire (`FormBuilder`/`InputfieldForm` module names,
  `htmx` for the month/year filter) — not one of the built-in ripper types
  (Squarespace/Eventbrite/Ticketmaster/DICE/AXS/Shopify), so this would
  need a custom `HTMLRipper`.
- Month/year pagination via query params: `/events/?month=<Month>&year=<Year>&view=tiles`
  — can walk forward several months to pick up future events beyond the
  current month.
- August 2026 snapshot: 5 events (4x recurring Drag Brunch on Sundays,
  1x one-off "BLANC" event on Aug 22). Confirms recurring weekly
  programming, not a one-off.
- Dates in the card text omit the year (`Sunday Aug, 2`) — parser will
  need to infer year from the `?year=` query param used for the fetch,
  and event start time is not shown on the tile (only on the per-event
  detail page, e.g. `/events/drag-brunch-4/`) — check the detail page
  for a time before implementing.
- No ICS/JSON API/ticketing platform detected (OpenTable is only used for
  restaurant reservations, not event ticketing).

🔴 Low confidence tier (custom HTML scraper, per-event detail page fetch
likely needed for start time) but genuinely fetchable and viable per the
quality-gate checklist.

**Implemented 2026-09-01** — re-checked before writing the custom scraper
and found each event detail page links to an Eventbrite ticket page
(e.g. `.../seattle-drag-brunch-at-fog-room-tickets-1992209203356`). That
listing resolves to Eventbrite organizer `121073963359`
(`fog-room-seattle`); the public Eventbrite API
(`eventbrite.com/api/v3/organizers/121073963359/events/?status=live`)
returned 20 live events at check time — the weekly Rooftop Drag Brunch
series (Sundays, 11:00 AM - 1:30 PM) plus other themed nightlife nights.
🔥 High confidence — verified working built-in `eventbrite` ripper type,
no custom scraper needed. Implemented as `sources/fog_room/ripper.yaml`
(`organizerId: "121073963359"`, `geo` set to the venue's OSM node
5855398686). Uses the existing `EVENTBRITE_TOKEN` repo secret already
configured in CI for other Eventbrite sources.
