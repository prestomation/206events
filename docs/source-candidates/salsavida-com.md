---
name: Salsa Vida Seattle Social Dance Calendar
status: added
platform: Custom HTML (JSON-LD ItemList)
url: https://www.salsavida.com/guides/washington/seattle/
tags: ["Dance"]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
pr: TBD
---

Discovered via aggregator gap analysis. Investigated further 2026-09-15:
the Seattle guide page (`/guides/washington/seattle/`) embeds a full
schema.org `ItemList` of `Event` JSON-LD covering the next ~2 weeks of
social-dance occurrences — name, start/end time with offset, venue
address + lat/lng, image, and price all in a single fetch (no per-event
page needed).

20 occurrences on the page at check time; 14 at venues with
`addressLocality: "Seattle"` (Salsa Con Todo, Baila District, Seattle
Harbor Nightclub, Sea Monster Lounge, Reverie Ballroom, Sueños de Salsa)
across 8 unique venues. The remaining 6 are Kirkland, Kent, and Shoreline
venues and are filtered out (not Seattle proper).

Implemented as `sources/salsavida` (custom HTML ripper, `sourceRole:
aggregator`, `geo: null`, tag `Dance`). Verified live via
`ONLY_SOURCE=salsavida npm run generate-calendars`: 14 events, 0 errors.
