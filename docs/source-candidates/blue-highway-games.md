---
name: "Blue Highway Games"
status: candidate
platform: recurring YAML (Lightspeed-powered site; interactive calendar is an Elfsight JS widget, not fetchable)
url: https://www.bluehighwaygames.com/
tags: [Gaming, QueenAnne, Beer]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

**Blue Highway Games** — `https://www.bluehighwaygames.com/` — board game store, café, and event space at 2203 Queen Anne Ave N, Seattle, WA 98109 (Queen Anne). Runs on Lightspeed e-commerce; its "Event Calendar" link is an Elfsight JS widget with no fetchable data behind it, but each recurring event has its own static description page with a stable, confirmed day/time pattern — same shape as the existing Little Red Hen and Seattle Chess Club recurring sources.

Investigated 2026-07-01:
- Confirmed via each event's `/events-details/...` page text (all "Updated: 1/2/2026" or similar):
  - **Community Game Night** — every Friday, 7:00–11:00 PM, free
  - **Beer & Board Games (21+)** — 3rd Saturday of the month, 7:00–10:00 PM, $10 (2 drink tickets)
  - **Family Game Day** — 2nd Sunday of the month, 10:00 AM–9:00 PM, free
  - **Heavy Games Club** — 1st Sunday of the month, 12:00–8:00 PM (two 4-hour sessions), free
  - **Learn to Play: A Featured Game** — last Saturday of the month, 7:00–10:00 PM, $5
  - **Used Puzzle Exchange** — last Sunday of the month, 11:00 AM–3:00 PM, free
- Skipped: **Board Game Industry Meet-Up** (3rd Wednesday) — professional/industry-only audience, not a general community event. **D&D Kids Campaign** and **RPG Intro Classes** — registration-based class series with shifting monthly start dates, no stable weekly identity to publish.
- Geo confirmed via Nominatim: `lat: 47.6385835, lng: -122.3571008`, OSM node `2019051176` ("Blue Highway Games", `shop=games`).
- Tag `QueenAnne` used (not `"Queen Anne"`) to match the existing spelling already registered in `city.config.ts` and used by other sources (avoids a near-duplicate tag collision).

Implemented as 6 recurring YAML files under `sources/recurring/blue-highway-games-*.yaml`, one per distinct event (mirroring the Little Red Hen precedent of one file per fixed weekly/monthly event at a shared venue).
