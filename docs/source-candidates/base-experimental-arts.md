---
name: "Base: Experimental Arts + Space"
status: added
pr: 838
platform: Squarespace
url: https://thisisbase.org/events
tags: [Arts, Georgetown]
firstSeen: 2026-07-03
lastChecked: 2026-07-03
---

Nonprofit dance/performance venue in Georgetown (6520 5th Ave S #122,
inside the Equinox Studios building), dedicated to "elevating risk and
invention in dance, performance, and multidisciplinary art." Not
previously covered by any existing source.

Investigated 2026-07-03:
- Squarespace confirmed, real `events` collection type (not a static
  `page` typeName)
- `/events?format=json` returns `upcoming: 2` (Base Residency Entry Point:
  Ajani Brannum, Jul 18 2026; Pairings: Collaborations in Movement and
  Music, Aug 1 2026), `past: 30`
- Low but genuine volume, consistent with other small-venue sources
  already in the calendar (Actualize AiR, Shunpike, Book Larder)
- Geo resolved via OSM way 231288129 (Equinox Studios building)

Implemented `sources/base_experimental_arts/ripper.yaml` (built-in
`squarespace` type). Confirmed live via
`ONLY_SOURCE=base-experimental-arts npm run generate-calendars`: 2 events,
0 errors.
