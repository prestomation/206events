---
name: "Visit Ballard"
status: added
platform: Tribe Events ICS (WordPress)
url: https://www.visitballard.com/events/
tags: [Community, Ballard]
firstSeen: 2026-06-16
lastChecked: 2026-06-16
---
**Visit Ballard** — `https://www.visitballard.com/events/` — Neighborhood events calendar for Ballard curated by the Ballard Alliance (a program at 2208 NW Market St Suite 230, Seattle, WA). Covers trivia nights, wine walks, cocktail trails, workshops, drag shows, gaming nights, book clubs, and cultural events at various Ballard venues (National Nordic Museum, Hattie's Hat, Artemis Coffee, etc.).

Investigated 2026-06-16:
- WordPress site with The Events Calendar (Tribe Events) plugin
- ICS feed at `https://www.visitballard.com/?post_type=tribe_events&ical=1&eventDisplay=list` — verified working, 26 upcoming events (June–August 2026)
- Event mix: trivia nights, karaoke, wine/cocktail events, book clubs, gaming nights, craft workshops, drag shows, cultural celebrations
- `geo: null` — multi-venue; events scattered across Ballard neighborhood
- Tags: Community, Ballard
- No proxy needed — accessible from sandbox

Implemented 2026-06-16: Added as external ICS source (`sources/external/visit-ballard.yaml`).
