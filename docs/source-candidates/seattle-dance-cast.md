---
name: "Seattle Dance Cast"
status: notviable
platform: Google Sites (hobbyist page)
url: https://www.seattledancecast.org/
tags: []
firstSeen: 2026-08-12
lastChecked: 2026-08-12
---

Hobbyist-maintained "social partner dance calendar" for the greater
Seattle area — weekly schedule grid (Tuesday–Monday) of dance nights
across many venues/styles (West Coast Swing, Kizomba, country, etc.).

Investigated 2026-08-12:
- Built on Google Sites; no ICS/API/feed, just a manually-edited page
  ("Bookmark this page", "Reload page for updates")
- Itself defers to `seattledanceinfo.com` (already covered:
  `sources/external/seattle-dance-info.yaml`) and `allseattletango.com`
  for authoritative listings
- No stable structure to scrape and largely duplicates an already-covered
  source

**Verdict**: Not viable — unstructured hobbyist page, redundant with
`seattle-dance-info`.
