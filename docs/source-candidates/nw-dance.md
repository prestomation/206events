---
name: NW Dance
status: added
platform: WordPress (Modern Events Calendar plugin) — RSS feed
url: https://nwdance.net/events
tags: [Dance]
firstSeen: 2026-08-14
lastChecked: 2026-08-31
pr: 1319
---

Pacific Northwest dance organization hosting social dance events and lessons.

**Findings (2026-08-14):** Live, active WordPress site running the "Modern Events Calendar
Lite" plugin (`wp-content/plugins/modern-events-calendar-lite`, `mec-*` CSS classes
throughout). Real events confirmed Aug-Nov 2026: "Boot Scootin' Fun at the Barn", "Casey
MacGill Quintet" free dance, "Seattle Houserockers", swing/blues bands at Leif Erikson Hall,
plus recurring class series (Bachata, Salsa for Beginners, Nightclub Two-Step). MEC
typically exposes an ICS export — worth checking for a `?mec-ical-export=1`-style endpoint
before writing an HTML scraper. Good event volume and mostly Seattle-area venues.

**Implemented 2026-08-31:** No `?mec-ical-export=1`-style ICS endpoint was found (Tribe
Events–style `?ical=1` isn't an MEC feature), but MEC auto-registers a WordPress-native RSS
feed at `/events/feed/` with structured `mec:startDate`/`mec:startHour`/`mec:endDate`/
`mec:endHour`/`mec:location`/`mec:cost` fields per item — a clean, custom `IRipper` reading
that feed (`sources/nw_dance/ripper.ts`) instead of scraping the HTML listing page. The feed's
`mec:location` is a bare venue name with no address, so the ripper maps the two venues seen so
far (Leif Erikson Hall, Sunset Hill Community Hall) to full addresses for precise geocoding;
an unmapped future venue falls back to the bare name for the geocoder to resolve on its own.
Verified live via `ONLY_SOURCE=nw-dance`: 10 events, 0 errors, 0 unresolvable locations.
