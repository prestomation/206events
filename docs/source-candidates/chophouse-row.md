---
name: "Chophouse Row"
status: added
platform: Squarespace
url: https://www.chophouserow.com/events
tags: [Music, "Capitol Hill"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---
Mixed-use retail/dining courtyard at 1424 11th Ave, Capitol Hill, hosting a recurring "Summer Sounds" live music series, "Courtyard Keys" piano sets, craft classes, and community meetups (small-business meetup, writing happy hour, literary meetup) among its tenant businesses (Cloud Room, etc.).

Investigated 2026-07-01:
- Squarespace confirmed (`?format=json` returns a standard events collection)
- 33 upcoming events confirmed live (through October 2026), e.g. "Summer Sounds - Tim Kennedy & Geoff Harper" (Jul 3), "Courtyard Keys featuring Bell on Piano" (Jul 5), "Capitol Hill Art Walk" (Jul 10)
- Music dominates the event mix, so tagged `Music` + `Capitol Hill`
- Some listed events ("Chophouse Row: Capitol Hill Art Walk") likely overlap with the existing `sources/recurring/capitol-hill-artwalk.yaml` recurring entry — cross-source dedup will reconcile

Implemented via the built-in `squarespace` ripper type (`sources/chophouse_row/ripper.yaml`, no custom code) — PR TBD.
