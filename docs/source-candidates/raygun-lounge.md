---
name: Raygun Lounge
status: investigating
platform: Custom (WordPress/Divi)
url: https://raygunlounge.com/calendar/
tags: [Nightlife, Capitol Hill]
firstSeen: 2026-07-19
lastChecked: 2026-07-19
pr:
---

Capitol Hill dive bar with a well-stocked tabletop-game library (pinball,
arcade, board games) plus pizza, beer, and cider — recommended alongside
Mox Boarding House and The Missing Piece as a Seattle board-game-cafe
destination. Has a dedicated `/calendar/` page.

Investigated 2026-07-19:
- Site is WordPress + Divi theme (`et_pb_*` builder markup); no "The
  Events Calendar" / Tribe plugin signature found
- `/calendar/` page returns HTTP 200 but the static HTML has no visible
  event listings, dates, or API endpoints — the calendar content appears
  to be rendered client-side (no JSON-LD, no iframe embed, no Eventbrite
  reference found in the fetched markup)
- Needs a follow-up look at the page's actual network requests (e.g. via
  a JS-capable fetch) to find the underlying data source before this can
  be scoped as Squarespace/API/custom-HTML
