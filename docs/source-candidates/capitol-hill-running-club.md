---
name: "Capitol Hill Running Club"
status: candidate
platform: recurring YAML (no ICS/API, fixed weekly schedule stated on site)
url: https://www.caphillrunclub.com/
tags: [Running, "Capitol Hill"]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---

**Capitol Hill Running Club** — `https://www.caphillrunclub.com/` — community-driven running club formed after the closure of the Capitol Hill Fleet Feet store. Hosts weekly group runs from the southern entrance of Cal Anderson Park, open to all paces.

Investigated 2026-07-02:
- Site is a SvelteKit SPA; the schedule itself ("Every Tuesday and Thursday, 6:00 PM PT, Cal Anderson Park - Southern Entrance") is server-rendered static text, but FAQ answers (distances, etc.) are client-rendered — no distance figures could be confirmed from the page source
- No ICS feed, API, or ticketing platform — this is a free, drop-in group run, not a ticketed event
- Fixed single location (Cal Anderson Park), fixed weekly day/time pattern — good fit for recurring YAML rather than a scraper
- Geo confirmed via Nominatim: Cal Anderson Park, Seattle, WA 98122 (47.6170377, -122.3191692, OSM way 158721036)
- `sourceRole: venue` (single org, fixed location)

Implemented 2026-07-02 as `sources/recurring/capitol-hill-running-club.yaml` (two schedule entries: every Tuesday and every Thursday, 18:00, PT1H30M).
