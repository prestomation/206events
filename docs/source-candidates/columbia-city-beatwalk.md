---
name: "Columbia City Beatwalk"
status: added
platform: recurring YAML (WordPress/MEC on beatwalk.org, no usable machine-readable data)
url: https://beatwalk.org
tags: [Music, "Columbia City", Community]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
---
Free outdoor live music festival series in Columbia City's historic commercial
district. Multiple stages along Rainier Ave S feature diverse genres including
Latin, jazz, R&B, hip-hop, world music, and roots. Runs every 2nd Sunday,
June through September. Free and family-friendly.

Investigated 2026-06-30:
- Site is WordPress with Modern Events Calendar (MEC) Lite v7.22.0
- MEC REST API at `/wp-json/mec/v1/events` returns `[]`
- WP REST API has 3 mec-events posts (R&B Hip Hop Funk, American Roots, Columbia
  City Pride) — all created 2025-05-22, all have Lorem Ipsum placeholder descriptions
- Events RSS feed is empty
- Per-event iCal exports work (`?method=ical&id=NNN`) but contain only 2025 dates
- No 2026 event pages have been entered in the CMS yet

Implemented as `sources/recurring/columbia-city-beatwalk.yaml` since the
schedule pattern is clear and consistent: every 2nd Sunday, June–September,
4 PM (confirmed from multiple sources including the official website and
web search results confirming June 7, 2026 date). Geocoded to Rainier Ave S,
Columbia City. RRULE: `FREQ=MONTHLY;BYDAY=2SU;BYMONTH=6,7,8,9`.
