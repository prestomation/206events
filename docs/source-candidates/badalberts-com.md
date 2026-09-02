---
name: "Bad Albert's Tap & Grill"
status: added
platform: SpotApps
url: https://badalberts.com/seattle-ballard-bad-albert-s-tap-and-grill-events
tags: ["Nightlife", "Ballard"]
firstSeen: 2026-08-25
lastChecked: 2026-09-02
pr: 1355
---

Ballard bar/pub (5100 Ballard Ave NW, Seattle, WA 98107) hosting themed bar
nights (Labor Day, National Sandwich Day) and a recurring annual St.
Paddy's Day Karaoke night.

Discovered via aggregator gap analysis (2026-08-25): 1 sample event
("National Whiskey Sour Day") from `badalberts.com`.

Implemented 2026-09-02: the canonical events page
(`/seattle-ballard-bad-albert-s-tap-and-grill-events`) runs on the
SpotApps platform (same platform as the already-covered `roam_bar`).
Each event renders a structured `addtocalendar` widget block
(`atc_date_start`/`atc_date_end`/`atc_title`/`atc_description`) giving
reliable local start/end datetimes with no free-text date parsing
needed. Confirmed 3 real upcoming events at implementation time. Added
as `sources/bad_alberts` (custom `HTMLRipper`), `sourceRole: venue`,
`geo` resolved to OSM node 2138389815 via Overpass.
