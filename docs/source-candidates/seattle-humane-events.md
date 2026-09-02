---
name: Seattle Humane Society Events
status: added
platform: Custom HTML (WordPress / Elementor nested-accordion)
url: https://www.seattlehumane.org/ways-to-give/events/
tags: [Community]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
pr: TBD
---

Seattle Humane Society fundraising and community events including adoption drives and galas.

**Vetting notes (2026-08-14):** Real, active org (headquartered in Bellevue —
Eastside, acceptable). Confirmed WordPress. 6 specific dated events found at
check time: Clear the Shelters (Aug 12-14), Summer Camp sessions, PAX West
(Sept 4-7), Cider Summit (Sept 11-12), Together for Pets Luncheon (Sept 25),
Sea-Meow Con (Nov 7-8). Events are static content blocks, not a dynamic
calendar — no ICS/API feed found, would need HTML scraping. Low-to-moderate
volume but legitimate. Not yet covered by any existing source.

**Implemented 2026-09-02:** Re-checked live — Clear the Shelters (Aug 12-14)
has since passed and dropped off the page; 4 dated events remain (PAX West,
Cider Summit, Together for Pets Luncheon, Sea-Meow Con), plus a non-dated
"Summer Camp" registration blurb. The page renders each event as an
Elementor nested-accordion item (`.e-n-accordion-item`) with a title, a
date/time/location paragraph (no year printed — inferred from the current
date), and a "Learn more"/"Get tickets" button linking to the event's own
ticketing page. No ICS/JSON feed exists, so implemented as a custom
`HTMLRipper` at `sources/seattle_humane/` that parses the accordion
directly off the single events-list page fetch (no per-event detail page
needed) and skips accordion items with no recognizable date line (e.g.
Summer Camp) rather than erroring on them. `geo: null` (rotating venues —
convention center, festival lawn, hotel, exhibition hall); `sourceRole:
venue` (first-party event series for one org, not a republishing
aggregator). `ONLY_SOURCE=seattle-humane npm run generate-calendars`
confirmed 4 events, 0 parse errors. 2 of the 4 venues (Washington State
Convention Center's "Arch and Summit Buildings" wing, South Lake Union
Discovery Center Lawn) didn't resolve via Nominatim — non-fatal
`GeocodeError`s left for `skills/geo-resolver/SKILL.md` to backfill via
`KNOWN_VENUE_COORDS`.
