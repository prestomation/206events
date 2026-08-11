---
name: Madrona Neighborhood Association
status: candidate
platform: Custom HTML (WordPress, no calendar plugin)
url: https://madrona.us/
tags: [Community, "Madrona"]
firstSeen: 2026-08-11
lastChecked: 2026-08-11
---

Neighborhood association for Madrona, on the east side of Capitol Hill /
Central District. Site is WordPress (Bosa theme), and events live as
individual static pages under an "Events & Programs" menu rather than a
Tribe Events (or other) calendar plugin — no `?ical=1` or similar export
link found.

Live events found on `/events/` at time of check (2026-08-11):
- Music in the Playfield — Aug 11, 18, 25, 2026, 6:00–8:00pm (recurring
  summer concert series at Madrona Playfield)
- MNA Monthly Meeting — Sept 2, 2026, 7:00–8:15pm
- Madrona Clean Up Day — Sept 20, 2026, 9am–12pm
- Thanksgiving Pie/Bake Sale — Nov 25, 2026
- Winter Market & Raffle — Dec 10, 2026

Also hosts the annual **Madrona Mayfair** (parade + block party, mid-May,
Madrona Playfield) — the neighborhood's best-known one-day event — though
that wasn't showing on `/events/` at time of check (likely posted closer to
the date each year).

No structured feed detected — would need a custom HTML scraper (🔴 Low
confidence) parsing the individual event pages, similar in spirit to
`hillman-city-neighborhood-association` and `phinney-neighborhood-association`
(both already-covered neighborhood associations). Reasonable event volume
(5 upcoming events plus the annual Mayfair) makes this worth a custom
scraper pass in a future implementation cycle.
