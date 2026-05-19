---
name: "Kremwerk + Timbre Room + Cherry"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-05-19
tags: [Music, Nightlife]
pr: pending
---
**Kremwerk + Timbre Room + Cherry** — Queer electronic/nightlife venue complex in Denny Triangle — Tags: Music, Nightlife

Investigated 2026-05-08:
- Squarespace `?format=json` returns `itemCount: 0` — JS-rendered events on the venue website, no Squarespace events collection

Re-investigated 2026-05-18:
- Confirmed DICE presence: `dice.fm/venue/kremwerk-complex-xmra`
- Search agent confirmed 30+ events per month (electronic, drag, queer nightlife)
- Built-in `dice` ripper type supported: `venueName: "Kremwerk Complex"`
- Address: 1809 Minor Ave, Seattle WA 98101 (Denny Triangle / First Hill)
- Note: Cannot verify exact DICE API venue name without `DICE_API_KEY` — needs CI verification

Implemented 2026-05-19:
- Added `sources/kremwerk/ripper.yaml` using `type: dice`, `venueName: "Kremwerk Complex"`
- OSM node 10121400584, geo: 47.6168989, -122.3311153
