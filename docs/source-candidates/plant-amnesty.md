---
name: "PlantAmnesty"
status: candidate
platform: Squarespace
url: https://www.plantamnesty.org/all-upcoming-events-classes
tags: [Education, Community]
firstSeen: 2026-08-27
lastChecked: 2026-08-27
pr:
---

Seattle-based tree/plant-care education nonprofit — "Master Pruner"
classes, plant walks, and fundraisers, mostly at Ballard/Wallingford-area
locations (7400 Woodlawn Ave NE) and public gardens (Dunn Gardens,
Washington Park Arboretum Pinetum, Mountaineers Program Center).

Investigated 2026-08-27:

- Native Squarespace **Events Collection** (`collection.typeName ==
  "events-stacked"`) at
  `https://www.plantamnesty.org/all-upcoming-events-classes?format=json`
- `data.upcoming` has 10 items, all with future `startDate` epoch
  timestamps confirmed (e.g. "Plant Walk: Dunn Gardens", "Master Pruner
  Class: Corrective Pruning")
- Locations: 9 of 10 upcoming events are in Seattle proper (Broadview,
  Wallingford, View Ridge, Washington Park Arboretum, Sand Point); 1 is
  at Bellevue Botanical Gardens — fine per the "few events outside city
  limits" allowance
- 🔥 High confidence — verified `itemCount`/future `startDate` per the
  quality-gate requirement, fits the built-in `squarespace` ripper type
