---
name: "Northwest Trail Runs"
status: candidate
platform: WordPress (Mergeo theme, Y-Designs)
url: https://nwtrailruns.com/events/
tags: [Outdoors, Community]
firstSeen: 2026-06-10
lastChecked: 2026-06-10
---
**Northwest Trail Runs** — `https://nwtrailruns.com/events/` — Washington State trail running events organization with many Seattle-area races.

Investigated 2026-06-10:
- WordPress site (Mergeo theme by Y-Designs), no Tribe Events plugin
- No ICS/iCal feed found; no REST API for events
- Calendar page at `/calendar/` shows a static HTML table with upcoming events
- Event registration via WebScorer and RunSignUp (not via the WordPress site)
- Multiple upcoming Seattle-area races confirmed:
  - Woodland Park Zoom — June 9, Seattle (5k & 10k)
  - Carkeek Warmer — June 23, Seattle (5k & 10k)
  - Seward Sizzler — July 7, Seattle (4.2mi & 10k)
  - Interlaken Ice Cream Dash — August 4, Seattle (5k & 10k)
  - Plus Cougar Mountain series (Newcastle, nearby) and others
- Many Seattle proper races (Woodland Park, Carkeek, Seward Park, Interlaken) — qualifies as Seattle-focused

Implementation path: Custom HTML scraper for the WordPress events table. Moderate effort (🔴 Low confidence tier — custom scraper needed). No ICS or API available.

Geo: `null` — itinerant events at different parks each race.
