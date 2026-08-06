# 2026-08-06 Discovery Log (social source discovery)

## Social source discovery: r/SeattleEvents

- Feed: 25 posts (2 new since last run on 2026-08-05)
- ❌ Skipped (one-off festival): Bellevue International Festival — 3rd annual single-day festival at Crossroads Park, Bellevue. URL: `bellevuewa.gov/.../bellevue-international-festival` — a static page for one event (Aug 8, 2026, noon–5pm). The parent "Diversity Advantage Events" page has no structured event calendar, and the city's `/events` URL redirects to a Special Events Committee page (permitting body, not a public events listing). No recurring event calendar to scrape. Also Bellevue-based, outside our primary Seattle coverage area (via [Reddit post](https://old.reddit.com/r/SeattleEvents/comments/1vgb51n/bellevue_international_festival_88/))

No new candidates this run.

## Source discovery: implementing highest-confidence candidate

- ✅ Added: The Cuff Complex — Squarespace — `upcoming` array repopulated with 3 future events (Thursday Night Lights Drag Show, Batthouse Disco, Hump Day Karaoke) since it was last checked 2026-07-23; confirmed via `?format=json` and geocoded to a known OSM node (`way/206623630`).