---
name: "Whim W'Him Seattle Contemporary Dance"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-09-16
pr: TBD
---
**Whim W'Him Seattle Contemporary Dance** — `https://whimwhim.org/calendar/` — Tags: Dance, Arts

Probed 2026-05-16: WordPress (Apache, has `/wp-json/`). Tribe Events ICS `?ical=1` returns HTML (ICS export disabled or not Tribe Events). Would need custom HTML scraper. Not investigated further — low priority until other sources exhausted.

Re-investigated 2026-09-16: the `/calendar/` page embeds an **OvationTix** widget
(`ovationtix.com/35510/production/1270644`) — same built-in ticketing platform
already used by `taproot`, `sound_theatre_company`, and `the_feast`. Confirmed
the public calendar API (`https://api.ovationtix.com/public/calendar/client(35510)`
with an `Origin: https://whimwhim.org` header) returns `clientName: "Whim W'Him"`,
`clientActive: true`, and real upcoming performances (Fall '26 season at Erickson
Theater). 🔥 High confidence — built-in `ovationtix` ripper type, verified working
clientId. Implemented as `sources/whim_whim/ripper.yaml` (itinerant company,
`geo: null`, matching the `the_feast`/`sound_theatre_company` pattern). Verified
via `ONLY_SOURCE=whim-whim npm run generate-calendars`: 7 events, 0 errors.
