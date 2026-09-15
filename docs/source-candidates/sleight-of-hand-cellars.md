---
name: "Sleight of Hand Cellars SoDo"
status: added
platform: Squarespace
url: https://www.sofhcellars.com/events
tags: [Wine, SoDo]
firstSeen: 2026-09-15
lastChecked: 2026-09-15
pr:
---

Walla Walla winery's SODO tasting room at 3861 1st Ave S, Seattle, WA 98134
(SODO Urbanworks) — turntables, wine releases, and a regular live music and
comedy lineup ("Sleightly Buzzed" first-Friday comedy nights).

Investigated 2026-09-15:
- Confirmed Squarespace with a real Events collection
  (`/events?format=json` → `collection.typeName: "events"`,
  `collection.itemCount: 278`)
- 13 upcoming events confirmed at time of check, all tagged `(SODO)` in the
  title, with real future `startDate` epoch timestamps (Sept 2026 – Feb
  2027): artist nights, a comedy series, wine release parties, and tribute
  band shows
- Each event item's `location` field carries its own lat/lng
  (47.5679264, -122.3353923) matching the SODO address
- Not previously covered under `sources/` or `docs/source-candidates/`
- Not a religious org

Implemented as a built-in `squarespace` ripper
(`sources/sleight_of_hand_cellars/ripper.yaml`).
