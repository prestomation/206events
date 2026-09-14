---
name: Raygun Lounge
status: added
platform: recurring YAML (Seattle POC Board Gaming schedule only; other schedules still unconfirmed)
url: https://raygunlounge.com/calendar/
tags: [Gaming, Capitol Hill]
firstSeen: 2026-07-19
lastChecked: 2026-09-14
pr: 1468
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

Re-checked 2026-09-14 — direct-fetched all four dedicated pages again to
resolve the "needs a follow-up look" from 2026-09-13:
- **Seattle POC Gamers** (`/gamers-of-color/`) — confirmed unambiguous,
  evergreen schedule text: "Every 1st & 3rd Saturday 7:00 PM ... every
  first and third Saturday for drinks and tabletop gaming!" No stale
  content signal. **Implemented** as
  `sources/recurring/raygun-lounge-poc-gaming.yaml`
  (`schedule: 1st and 3rd Saturday`, `start_time: "19:00"`,
  `duration: PT4H`) — PR pending.
- **Boardgame Night** (`/boardgame-night/`) — the page's only schedule
  text is a single dated post, "Fri, June 21st at 7pm", with no year and
  no "every Friday" framing. The site's own blog archive stops at April
  2025 (17+ months stale as of this check), so this reads as an
  abandoned one-off post rather than a confirmed current recurring
  pattern — **not implemented**, despite the "1st, 3rd, and 5th Friday"
  note logged 2026-09-13 (that characterization came from a secondary
  listing site, not this primary page, and could not be corroborated
  here).
- **Story Games Seattle** (`/story-games/`) — page still states no
  day/time at all ("Seattle's longest running story games night"), just
  marketing copy. **Not implemented** — no schedule to encode.
- **West Marches Drop-In D&D** — not yet found as a dedicated page on
  the site; only referenced as a blog-post title in the archive list.
  **Not investigated further this cycle.**

Leaving `status: added` (one real recurring event is now live) while the
other three schedules stay open follow-ups — re-check Boardgame Night if
the site's blog activity resumes, and look for a primary-source Story
Games / West Marches schedule in a future cycle.
