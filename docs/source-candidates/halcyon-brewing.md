---
name: "Halcyon Brewing Co"
status: added
platform: Squarespace
url: https://www.halcyonbrewingco.com/events
tags: [Beer, Greenwood]
firstSeen: 2026-09-19
lastChecked: 2026-09-19
pr:
---

Greenwood neighborhood brewery/taproom at 8564 Greenwood Ave N, Seattle, WA
98103, with regular interactive event programming (trivia, chess club, live
bluegrass, improv comedy, game/craft nights, Seahawks watch parties).

Investigated 2026-09-19:
- Confirmed Squarespace with a real Events collection (`?format=json` →
  `collection.typeName: "events-stacked"`, `collection.itemCount: 271`)
- 21 confirmed upcoming events with future `startDate` epoch timestamps
  (recurring weekly series: Trivia Tuesday, Chess Club, Live Bluegrass &
  Chess Club, plus one-offs like Improv Overload, Comedy Show, Bob Ross
  Paint Challenge)
- 🔥 High-confidence built-in Squarespace candidate — implemented directly
- Not already covered under `sources/` or `sources/external/`
- Not a religious org; real Seattle venue with a fixed address
- Implemented as `sources/halcyon_brewing/ripper.yaml` (built-in
  `squarespace` type, no custom code). Address geocoded to the OSM
  `Halcyon Brewing Company` node (`osmId: 1733419952`) directly via
  Nominatim, so it lands with a known OSM id from day one.
- Verified via `ONLY_SOURCE=halcyon-brewing npm run generate-calendars`:
  21 events, 0 errors, 0 geocode errors (single fixed venue geo applied to
  all events). Full `npm run test` (3936 tests, 224 files) green.
