---
name: "Washington State Food Truck Finder"
status: added
platform: Custom ASP page (embedded JS array)
url: https://findfoodtrucks.wafoodtrucks.org/
tags: [FoodTruck]
firstSeen: 2026-09-27
lastChecked: 2026-09-27
---

Member directory of the Washington State Food Truck Association (WSFTA).
About 100 trucks across the state. Each truck can post its upcoming stops.

Investigated 2026-09-27:
- No ICS feed and no JSON API. The home page embeds all trucks as a
  JavaScript array (`const trucks = [...]`). Each truck has a
  `scheduleHtml` string with one `.scheduleItem` per stop (location name,
  address, start and end time, and a Google Maps link with lat,lng).
- 23 stops statewide on this date. 7 are in the Seattle map bounds
  (Tukwila, Redmond, Bothell area). The ripper drops stops outside
  `CITY.map.clampBounds` and placeholder stops longer than 16 hours.
- `sourceRole: aggregator` because it republishes stops for many trucks.
