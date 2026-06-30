---
name: "Side Rail Collective"
status: added
platform: Squarespace
url: https://www.siderailcollective.com/calendar
tags: [Arts, Georgetown]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
pr: pending
---
Artist studios, shared workspace, and gallery in Georgetown at 5511 1/2 Airport Way S, Seattle, WA 98108. Hosts gallery open hours/members shows, Art Attack (Georgetown's monthly art walk), figure drawing, circle singing, Saturday Stitch, and astrology/collage workshops.

Investigated 2026-06-30:
- Squarespace confirmed (`squarespace-cdn.com` image URLs)
- `/calendar?format=json` returns 33 upcoming events with valid future epoch timestamps (through early 2027)
- Address geocoded via Nominatim: 47.5528924, -122.3209540 (osm node 2396888055)

Implemented as `sources/side_rail_collective/ripper.yaml` using the built-in `squarespace` ripper type.
