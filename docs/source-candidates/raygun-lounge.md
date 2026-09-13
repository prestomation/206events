---
name: Raygun Lounge
status: investigating
platform: Custom (WordPress, no structured feed found)
url: https://raygunlounge.com/calendar/
tags: [Gaming, Capitol Hill]
firstSeen: 2026-07-19
lastChecked: 2026-09-13
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

Re-checked 2026-08-13: `/calendar/` still returns HTTP 200 with no
JSON, iframe embed, API endpoint, or third-party widget reference in
the fetched markup — same result as 2026-07-19. Still needs a
JS-capable fetch to find the real data source. No status change.

Re-checked 2026-09-13:
- Confirmed WordPress (footer links to WordPress.org, `wp-content` asset
  paths). Has an RSS feed (`/feed/`) but still no Tribe Events / ICS export
  — `?post_type=tribe_events&ical=1&eventDisplay=list` returns an HTML page
  (content-type `text/html`), not a VCALENDAR body. No Tribe REST API or
  other JSON endpoint found either — same dead end as prior checks, from a
  different angle.
- However, the venue's own dedicated pages (`/boardgame-night/`,
  `/story-games/`, `/gamers-of-color/`) describe a small set of **fixed
  recurring schedules** rather than one-off dated listings, which may fit
  `sources/recurring/<name>.yaml` better than a scraper once each schedule
  is confirmed from the primary page (not secondary listing sites):
  - Boardgame Night — "1st, 3rd, and 5th Friday" nights, 7pm
  - Seattle POC Gamers — 1st and 3rd Saturdays
  - Story Games Seattle — recurring weekly night (day/time not yet
    confirmed from a primary source)
  - West Marches Drop-In D&D — weekly Thursday sessions
- 🟡 Medium confidence — needs a direct re-fetch of each of those pages to
  pin down the exact weekday/time text before writing a recurring YAML
  (the recurring schema needs an exact `schedule` string), or a custom HTML
  ripper if per-event details turn out to vary meaningfully.
- Not currently covered elsewhere in `sources/` or `sources/external/`.
