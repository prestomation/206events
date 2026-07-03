---
name: Ballard Comedy Takeout
status: investigating
platform: Eventbrite
url: https://www.eventbrite.com/e/ballard-comedy-takeout-weekly-open-mic-on-thursdays-tickets-1988969007844
tags: [Comedy, Ballard]
firstSeen: 2026-07-02
lastChecked: 2026-07-03
pr: 838
---

Weekly comedy open mic at Ballard Mandarin (5500 8th Ave NW, Seattle, WA
98107), Thursdays 8:30 PM, hosted by Big Time Mel, free/21+. Verified via
the public Eventbrite organizer events API
(`eventbrite.com/api/v3/organizers/121332375671/events/?status=live`):
`organizerId: 121332375671`, 2 live upcoming dated events (Jul 2 and Jul 9,
2026) matching the weekly Thursday cadence. 🔥 High confidence — built-in
`eventbrite` ripper type, verified working organizerId.

Implemented 2026-07-03: `sources/ballard_comedy_takeout/ripper.yaml`
(built-in `eventbrite` type, `organizerId: 121332375671`, geo from OSM node
2136834138). Local `ONLY_SOURCE` build confirms the config/schema is valid;
0 events locally is expected since `EVENTBRITE_TOKEN` isn't available in
this environment (same shared secret already used by `club-comedy` and
`actualize-air`) — CI has the real token via `secrets.EVENTBRITE_TOKEN`.
Left as `investigating` until CI confirms events > 0, then flip to `added`.
