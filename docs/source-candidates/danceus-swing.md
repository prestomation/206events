---
name: DanceUS Seattle Swing Calendar
status: added
platform: Custom HTML (DanceUS.org)
url: https://www.danceus.org/events/swing/seattle-wa-swing-calendar
tags: [Dance]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
pr: 1337
---

Aggregated calendar of swing dancing events in the Seattle area.

Verified 2026-08-14: live page, filtered to Seattle, showing a full week
of dated events (Savoy Fridays beginner lesson, Swing Saturdays social,
Swing Sundays at Century Ballroom, plus daily classes) with prices.
No ICS/iCal export or public API endpoint found (checked page source for
`ical`/`.ics`/`webcal`/`/api/events` — only generic feedback/subscribe
endpoints exist). Would need HTML scraping (`HTMLRipper`). Not a
religious org; not already covered under `sources/` (no existing swing
dance source). Good HTML-scraping candidate — consistent weekly volume.

**Implemented 2026-09-02** as `sources/danceus_swing` (`sourceRole: aggregator`,
`geo: null`, tag `Dance`). The listing page's own JSON-LD (`application/ld+json`)
turned out to carry reliable structured data per event — venue name, lat/lng,
description, image, canonical url — for every event on the rolling ~1-week
window; only the start time (and, for some, price) had to come from the
visible `.search-event-card` markup, matched back to the JSON-LD entry by
event url. 45 of 47 listed events are in Seattle proper; the 2 Eastside
listings (Kirkland Dance Center, a Mercer Island venue) are filtered out via
the JSON-LD `addressLocality` field. One event with no listed start time
(DanceUS renders it as a literal midnight placeholder) is emitted with a
placeholder noon start and flagged via the event-uncertainty system.
