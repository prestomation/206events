---
status: added
name: Seattle Folklore Society
url: https://seafolklore.org/events/
icsUrl: https://seafolklore.org/?post_type=tribe_events&ical=1&eventDisplay=list
tags: [Music, Arts]
sourceRole: venue
geo: null
addedPR: 713
lastChecked: 2026-06-30
---

Seattle's community folk music organization presenting traditional folk, Celtic, acoustic, and world music concerts at venues across Seattle including Phinney Center Concert Hall and Fremont Abbey.

ICS feed (Tribe Events) returns only stale 2015–2018 events — WordPress plugin not updating the ICS cache. REST API (`/wp-json/em/v1/events`) unavailable. Re-implemented 2026-06-30 as a custom HTML ripper (`sources/seattle_folklore_society/ripper.ts`) that parses the Events Manager event list at `seafolklore.org/events/`. Produces 4 upcoming events (July, September ×2, November 2026). Replaced `sources/external/seattle-folklore-society.yaml`.
