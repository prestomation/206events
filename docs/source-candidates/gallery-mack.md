---
name: "Gallery Mack"
status: added
platform: Squarespace
url: https://www.gallerymack.com/exhibitions
tags: [Arts, Belltown]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
pr: pending
---

**Gallery Mack** — `https://www.gallerymack.com/exhibitions` — contemporary art gallery at 2100 Western Avenue, Belltown. Hosts rotating solo and group exhibitions with opening receptions.

Investigated 2026-06-30:
- Squarespace confirmed (`?format=json` on `/exhibitions`)
- Collection type `events-stacked`, 2 upcoming exhibitions with future `startDate`/`endDate` epoch timestamps: "Rooted by Sherrie Newman" (through ~Jul 2026) and "Art Goals" (Sep 2026–Dec 2026)
- Each exhibition has a per-event `?format=ical` export available too
- Fixed single venue; address geocoded to OSM node 2327723046 (47.6113199, -122.3447840)
- No ticketing/admission fee found on exhibition pages — `cost: free`
- Implemented as built-in `squarespace` type ripper (`sources/gallery_mack/ripper.yaml`)
