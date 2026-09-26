---
name: "My Necessitea"
status: added
platform: Squarespace
url: https://www.mynecessitea.com/calendar
tags: ["Food", "West Seattle"]
firstSeen: 2026-09-26
lastChecked: 2026-09-26
pr:
---

Woman-owned tea room at 3237B California Ave SW, Seattle, WA 98116 (West
Seattle / The Junction), operating since 2003. Hosts afternoon tea services,
tea tastings, seasonal events ("Witches Afternoon Tea"), an art evening, and
recurring Friday morning meditation.

Investigated 2026-09-26:
- Confirmed Squarespace (`?format=json` on `/calendar` returns a valid
  Squarespace collection payload).
- `upcoming: 3` events with real future `startDate` epoch values (Northwest
  Tea Festival 2026 — May 2026 at Seattle Center Exhibition Hall; An Evening
  of Art featuring Joey Masciotra — Oct 10 2026; Witches Afternoon Tea —
  Oct 31 2026).
- Not already covered in `sources/` or `sources/external/`.
- Implemented as `sources/mynecessitea/ripper.yaml` using the built-in
  `squarespace` type — no custom ripper code needed. Geo confirmed via
  Nominatim (OSM way `570544447`, matches the Squarespace event location
  coordinates for the venue's own address).
- `ONLY_SOURCE=mynecessitea npm run generate-calendars` produced 3 events,
  0 errors.
