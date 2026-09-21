---
name: "Seattle Growers Market"
status: added
platform: Squarespace
url: https://www.seattlegrowersmarket.com/events/
tags: [Creation, Georgetown]
firstSeen: 2026-09-21
lastChecked: 2026-09-21
pr: 1555
---

Wholesale flower market at 665 South Orcas Street, Georgetown, hosting
public floral-design classes ("Coffee & Cut Flowers" grower meetups,
seasonal bouquet/wreath/centerpiece workshops) and occasional ceramics
workshops with guest florists/artists.

Investigated 2026-09-21:
- Confirmed Squarespace (`?format=json` on the events page returns a
  valid `events-stacked` collection, `itemCount: 35`)
- 5 upcoming events with real future `startDate` epoch timestamps
  (Oct–Dec 2026): Coffee & Cut Flowers grower meetups, Fall Hand-tied
  Bouquet workshop, Hand-Build a Ceramic Vase workshop, Yule Log
  Centerpiece workshop
- All events at the venue's own address, 665 South Orcas Street,
  Seattle, WA 98108 (Georgetown) — geocoded via Nominatim
  (`osmId: 2396888125`, node)
- Not previously covered under `sources/` or `sources/external/`

Implemented as `sources/seattle_growers_market/ripper.yaml` (built-in
`squarespace` type, no custom code). Verified via
`ONLY_SOURCE=seattle-growers-market npm run generate-calendars`: 5
events, 0 errors, 0 geocode errors. Tags `Creation` (floral/ceramics
workshops), `Georgetown` (neighborhood).
