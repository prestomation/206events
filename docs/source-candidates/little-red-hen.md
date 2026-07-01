---
name: "Little Red Hen"
status: added
platform: recurring YAML (static HTML calendar, no ICS/API)
url: http://www.littleredhen.com/pages/cal.html
tags: [Music, Dance, Nightlife, OpenMic, "Green Lake"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
pr: TBD
---

**Little Red Hen** — `7115 Woodlawn Ave NE, Seattle, WA 98115` (Green Lake) —
Seattle's longtime country-western live music and dance bar (open since 1933).

Investigated 2026-07-01:
- The venue's current site (`littleredhenseattle.com`, GoDaddy Website Builder) is
  mostly stale (subpages last touched Oct 2024), but the homepage confirms a fixed
  weekly schedule and links to a "Master Calendar"
- That calendar (`littleredhen.com/pages/cal.html`, a legacy static HTML page) is
  actively maintained — `Last-Modified` header was the day before this check — and
  shows a full month grid confirming the same weekly pattern every week:
  - **Monday**: Line Dance practice (8pm) + Line Dance Party (9pm)
  - **Tuesday**: "Tequila Tuesday" Bluegrass Open Jam Session (7:30pm)
  - **Wednesday**: DJ Forrest Gump Karaoke, 9pm–1:30am
  - **Thursday–Saturday**: live touring/local bands (varies weekly, $5–$10 cover) —
    not implemented; no stable per-week identity to publish as a recurring event
  - **Sunday**: 5–7pm Artist Showcase (varies) + 7:30pm "Bodacious Open Mic Jam",
    open dance floor, no cover
- No ICS/API; implemented as 4 recurring YAML files (one per fixed weekly event,
  matching the multi-file pattern used for `hitc-trivia-*` and `unicorn-seattle-*`):
  `sources/recurring/little-red-hen-monday-line-dance.yaml`,
  `little-red-hen-tuesday-bluegrass-jam.yaml`, `little-red-hen-wednesday-karaoke.yaml`,
  `little-red-hen-sunday-open-mic.yaml`
- `geo`: OSM node `2463139502` (amenity=bar, name="Little Red Hen"), confirmed via Nominatim
- `sourceRole: venue` (single fixed physical location)
- Verified via `ONLY_SOURCE=little-red-hen-monday-line-dance,little-red-hen-tuesday-bluegrass-jam,little-red-hen-wednesday-karaoke,little-red-hen-sunday-open-mic npm run generate-calendars` — 1 event each, 0 errors
