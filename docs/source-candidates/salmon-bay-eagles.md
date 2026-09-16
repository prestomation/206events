---
name: "Salmon Bay Eagles"
status: added
platform: ICS (WordPress / The Events Calendar)
url: https://salmonbayeagles.com/events/
tags: [Music, Ballard]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
pr: 1509
---

Fraternal Order of Eagles Aerie #2141 in Ballard (5216 20th Ave NW, Seattle,
WA 98107) — functions publicly as a live music venue (listed on Yelp under
"Music Venues"), hosting bands, blues/jazz jam nights, and karaoke most
nights of the week, alongside internal Aerie business meetings.

Discovered via a dance-events aggregator (seattledancecast.org) linking out
to individual venue calendars.

Investigated 2026-09-16:
- WordPress site running The Events Calendar (Tribe Events) plugin, with a
  confirmed working ICS export: `https://salmonbayeagles.com/events/?ical=1`
  — 17 live `VEVENT`s at time of check (band nights, jam sessions, plus a
  few internal "Trustee Meeting"/"Aerie Meeting" entries).
- Every event's `LOCATION` field is the literal string `"Social Room"` (an
  in-building room name, not a geocodable address) — added a
  `KNOWN_VENUE_COORDS` entry for it in `lib/geocoder.ts` so events resolve
  to the venue's coordinates instead of failing Nominatim geocoding.
- Not a religious org (fraternal/civic lodge); primarily Seattle (Ballard).

Implemented as `sources/external/salmon-bay-eagles.yaml` (plain ICS feed,
best-case integration per the calendar integration strategy — no custom
ripper needed).
