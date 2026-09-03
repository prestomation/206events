---
name: "Seattle Design Festival"
status: candidate
platform: WordPress (custom post type)
url: https://seadesignfest.org/
tags: [Arts, Community]
firstSeen: 2026-09-03
lastChecked: 2026-09-03
---
**Seattle Design Festival** — nonprofit multi-day design festival
(8,000+ attendees), features a "Block Party" kickoff plus multiple days
of talks, tours, and installations across Seattle venues. 2026 edition
ran Aug 15-20 (already concluded at time of check) at Lake Union Park
and partner sites.

Investigated 2026-09-03:
- Site is WordPress with a custom `events` post type (URLs like
  `/events/2026/sdf-2026-partner-volunteer-social/`), but that post type
  is **not exposed** via the standard `wp-json/wp/v2/` REST routes
  (confirmed 404 on `/wp-json/wp/v2/events`) and there is no Tribe
  Events / The Events Calendar plugin (`/wp-json/tribe/events/v1/events`
  also 404).
- No ICS/RSS export found.
- Individual session/installation details for the Aug 2026 run appear
  to live behind a JS-filtered "Calendar of Events & Installations"
  widget referenced on the site, not confirmed reachable via plain fetch.
- Even if scraped, this is a single annual multi-day festival (one
  cluster of dates per year) — low event-volume yield relative to the
  custom-scraper effort required, and next year's dates/URLs aren't
  published yet.

Left as `candidate` rather than `notviable` — worth a second look closer
to the 2027 festival announcement (typically spring) when a fresh
schedule page exists to actually fetch and evaluate, rather than
speculatively building against 2026's already-concluded event list.
