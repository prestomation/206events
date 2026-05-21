---
name: "Unexpected Productions"
status: added
platform: WordPress/Tribe Events ICS
url: https://www.unexpectedproductions.org/events/
tags: [Comedy, Pike Place]
firstSeen: 2026-05-21
lastChecked: 2026-05-21
---

**Unexpected Productions** — Market Theater, 1428 Post Alley at the Gum Wall, Pike Place Market, Seattle WA 98101. Seattle's pioneering improv comedy organization hosting weekly shows: Seattle Theatresports (Fri/Sat), Improv Happy Hour, Spellbound, Funny You Should Say That, and other ensemble productions.

Tribe Events ICS feed at `/?post_type=tribe_events&ical=1&eventDisplay=list` returns 200 OK (`text/calendar`) with 30 upcoming events. No proxy required (accessible from sandbox).

Implemented as `sources/external/unexpected-productions.yaml`. Updated geo from `null` to lat/lng (47.6083380, -122.3402630, OSM node 2397493563) and changed tags from `Theatre` to `Comedy`.
