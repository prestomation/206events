---
name: "REFRACT — The Seattle Glass Experience"
status: added
platform: Tribe Events ICS (WordPress)
url: https://refractseattle.org/
tags: [Arts]
firstSeen: 2026-06-17
lastChecked: 2026-06-17
---
**REFRACT — The Seattle Glass Experience** — `https://refractseattle.org/` — Annual Seattle glass arts festival hosted by Chihuly Garden and Glass in partnership with Visit Seattle, featuring studio open studios, glassblowing demonstrations, tours, and hands-on workshops at participating glass studios across Seattle (typically mid-October, 4 days).

Investigated 2026-06-17:
- WordPress site with Tribe Events plugin
- ICS feed at `https://refractseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list` — verified working, 34 events (32 in October 2026 + 2 in 2027)
- Events at multiple Seattle venues: Blowing Sands Glass (Ballard), Patinna Studios (SoDo), Seattle Glassblowing Studio (Belltown), Pratt Fine Arts Center (Central District), and others
- 2026 dates: October 15–18
- `geo: null` — multi-venue city-wide glass arts festival
- `sourceRole: venue` — REFRACT is the primary source; these studio events are not covered elsewhere in 206.events
- Tags: Arts
- No proxy needed — accessible from sandbox

Implemented as `sources/external/refract-seattle.yaml`.
