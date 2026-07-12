---
name: "SeattleArtists.com"
status: notviable
platform: Custom (Next.js)
url: https://www.seattleartists.com/calendar
tags: []
firstSeen: 2026-07-12
lastChecked: 2026-07-12
---
Local art-events directory/calendar site referencing an "Art Calendar" page
aggregating gallery and studio events citywide.

Investigated 2026-07-12:
- `/calendar` page returns HTTP 200 but is a client-rendered Next.js app —
  no event data, JSON-LD, or calendar-platform hints (Squarespace/WordPress/
  Tribe) present in the static HTML
- No ICS feed, API, or structured event markup found
- Not viable without JS rendering support the pipeline doesn't have; would
  need to re-investigate if the site adds a public feed
