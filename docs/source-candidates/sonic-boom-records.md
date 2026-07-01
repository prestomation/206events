---
name: "Sonic Boom Records"
status: added
platform: Squarespace
url: https://www.sonicboomrecords.com/instores
tags: ["Music", "Ballard"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
pr: 794
---
Independent record store at 2209 NW Market St, Ballard, hosting in-store
listening parties and occasional live performances tied to new releases
(Death Cab for Cutie, Boards of Canada, Courtney Barnett, Cat Clyde, Nada
Surf, Jessica Pratt, and annual Record Store Day events over the past year).

Investigated 2026-07-01:
- Squarespace confirmed (`squarespace-cdn.com` image URLs, `?format=json` endpoint)
- `upcoming` array returns 1 real event with a future epoch-millisecond `startDate`: "Listening Party: Panda Bear & Sonic Boom 'A ? of WHEN'" — July 8, 2026, 6pm PT
- `past` bucket shows frequent programming historically, so future events should keep appearing even though only 1 is posted right now
- No credential required — public Squarespace JSON endpoint
- `geo`: fixed venue address (OSM node 2275838764), `sourceRole: venue`
- Implemented as `sources/sonic_boom_records/ripper.yaml` (built-in `squarespace` type, no custom code needed)
