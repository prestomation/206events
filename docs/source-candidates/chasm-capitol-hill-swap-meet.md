---
name: "CHASM (Capitol Hill Awesome Swap Meet)"
status: added
platform: Recurring YAML (hand-coded, fixed monthly schedule)
url: https://www.punkrockfleamarketseattle.com/pages/upcoming-chasm
tags: [MakersMarket, "Capitol Hill"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
pr: TBD
---

**CHASM** (Capitol Hill Awesome Swap Meet, formerly "SPASM") — monthly
vintage/handmade/collectibles swap meet at the Quality Flea Center, 406 15th
Ave E, Capitol Hill (Madison Valley), run by the same organizers as the
quarterly Punk Rock Flea Market. 40+ vendors, live DJs, occasional live
music/belly dance/puppet shows.

Investigated 2026-07-01:
- Page (`punkrockfleamarketseattle.com/pages/upcoming-chasm`, Shopify site)
  states plainly: "Every THIRD SATURDAY all year long! ... Noon - 6PM" and
  confirms currency with "CHASM will return on July 18" (2026's 3rd Saturday
  of July) after a stated skip in June 2026 (venue given over to the full
  Punk Rock Flea Market weekend)
- No ICS/API — implemented as hand-coded `sources/recurring/chasm-capitol-hill-swap-meet.yaml`
  (`schedule: 3rd Saturday`, `start_time: "12:00"`, `duration: PT6H`),
  following the farmers-market/flea-market recurring pattern
  (`magnolia-flea-market.yaml`, `fremont-evening-market.yaml`)
- Address geocoded via Nominatim: 47.6222589, -122.3125185 (OSM way 6457203,
  Madison Valley/Capitol Hill)
- Free general admission (vendor booth fees don't apply to attendees)
- **Known limitation:** the recurring-YAML schema has no per-date exclusion
  mechanism, so months where CHASM is skipped for the full quarterly PRFM
  weekend (e.g. June 2026) will still produce a 3rd-Saturday occurrence in
  our calendar. Documented as a comment in the YAML; consistent with the
  existing tolerance for approximate recurring patterns (see `bumbershoot.yaml`).
