---
name: Madrona Neighborhood Association
status: added
platform: Custom HTML (WordPress, no calendar plugin)
url: https://madrona.us/
tags: [Community, "Madrona"]
firstSeen: 2026-08-11
lastChecked: 2026-09-05
pr: 1378
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

**Implemented 2026-09-05:** Re-verified the Tribe Events REST API
(`/wp-json/tribe/events/v1/events`) still returns `total: 0` — confirms
there is genuinely no calendar-plugin feed to prefer over page scraping.
Of the events listed on `/events/`, three currently carry a concrete,
scrapable date: **Trick or Treat 34th Ave** (fixed "Saturday, Oct 31,
2026 / 4-6PM"), **Monthly Meetings** (the page announces only the next
upcoming meeting, e.g. "Wednesday October 7th, 2026 / 7:00PM-8:15PM" —
re-scraped every build), and **Music In The Playfield** (explicit dated
Tuesdays per summer, e.g. "AUGUST 11 · 18 · 25 / 6 to 8 PM"). The
remaining pages (Mayfair, Madrona Clean Up Day, Thanksgiving Bake Sale,
Winter Market, Madrona Yard Sale, Blossoms) are announced as "Date TBA"/
"Date & Time TBD" at time of check with no concrete date to scrape — the
ripper returns a `ParseError` for those rather than guessing, and can
pick them up automatically once a date is posted.

Implemented as a custom `IRipper` (`sources/madrona_neighborhood_association/`)
with one dedicated parser per page (each page's freeform wording differs).
`geo: null` at the ripper level since events span multiple locations
(Madrona Playfield, the Playfield Shelterhouse, and the 34th Ave business
district); per-event `location` strings are geocoded automatically by the
standard pipeline. Confirmed 2 live events in a local `ONLY_SOURCE` build
(the Aug 2026 Music In The Playfield dates had already passed by the
2026-09-05 build date, so 0 events from that page this cycle — expected,
not an error).
