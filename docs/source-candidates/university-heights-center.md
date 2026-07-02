---
name: "University Heights Center"
status: added
pr: pending
platform: Squarespace
url: https://www.uheightscenter.org/upcoming-events
tags: [Community, "University District"]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---

**University Heights Center** — `https://www.uheightscenter.org/upcoming-events` — community center and event-venue rental space in a historic school building at 5031 University Way NE, University District. Home to the "UHeights Theatre Alliance" rehearsal/workshop space, drop-in community programs (Thursdays at 10 conversation/book/memoir/stitchery groups, Online Zumba), Summer Park Pop-Ups (live music, dance, henna, interactive booths at UHeights Plaza), and outreach programs.

Investigated 2026-07-02:
- Squarespace confirmed; `/upcoming-events?format=json` returns a standard `events-stacked` collection with **36 upcoming events** confirmed live
- Mix of physical (UHeights Plaza, Room 104, Room 209/Auditorium) and virtual (Zoom) programs — all public and open to attend/register, not internal/administrative
- Address confirmed via Nominatim: 5031 University Way NE, Seattle, WA 98105 (47.6658699, -122.3135511, osm way 54356423, `amenity=community_centre`)
- Implemented via the built-in `squarespace` ripper type (`sources/university_heights_center/ripper.yaml`, no custom code) — build confirmed 36 events, 0 errors
