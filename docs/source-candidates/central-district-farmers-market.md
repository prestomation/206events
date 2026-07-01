---
name: "Central District Farmers Market"
status: added
platform: recurring YAML (fixed weekly schedule)
url: http://www.sfmamarkets.com/central-district-farmers-market
tags: [FarmersMarket, "Central District"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---
Weekly seasonal farmers market (formerly known as the Madrona Farmers Market) run by the Seattle Farmers Market Association — the same nonprofit that runs the already-covered Ballard and Wallingford Farmers Markets. Located in the Madrona Grocery Outlet parking lot, corner of Martin Luther King Jr Way & E Union St.

Investigated 2026-07-01:
- Confirmed via sfmamarkets.com: "Every Friday 3:00PM-7:00PM", May through October (2026 opening day May 16, through Oct 21)
- Not a duplicate of `sources/friends_of_madison_park` (a different, separate Madison Park farmers market run by a different org)
- SFMA's own site also lists a "South Lake Union Farmers Market" (Saturdays, 6th Ave between Lenora & Bell St) — this appears to be the **same physical market** as the already-covered `sources/recurring/south-lake-union-saturday-market.yaml` (same street, same neighborhood), just now organized under SFMA as an official WA State Certified Farmers Market starting June 2026 — not added as a separate source to avoid duplicating an existing one

Implemented as recurring YAML (`sources/recurring/central-district-farmers-market.yaml`) — PR TBD.
