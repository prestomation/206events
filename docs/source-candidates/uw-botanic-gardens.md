---
name: "UW Botanic Gardens"
status: added
platform: Trumba ICS
url: https://botanicgardens.uw.edu/about/events/
tags: [Education, Parks, Community, "University District"]
firstSeen: 2026-06-28
lastChecked: 2026-06-28
---
**UW Botanic Gardens** — `https://botanicgardens.uw.edu/about/events/` — University of Washington Botanic Gardens, encompassing Washington Park Arboretum (2300 Arboretum Dr E) and the Center for Urban Horticulture (3501 NE 41st St). Hosts guided walks, pruning/gardening workshops, yoga classes, forest bathing, art workshops, and educational programming.

Investigated 2026-06-28:
- Trumba calendar confirmed: `https://www.trumba.com/calendars/uwbg.ics`
- 34 events confirmed (July–November 2026)
- Events include: Yoga in the Arboretum, Free 1st Thursday Public Tour, Arboretum Walking Tours, Master Pruner lecture series, Forest Bathing, Field Sketching, Native Plants 101, Music in the Arboretum
- Multi-location source (Arboretum + CUH + online), so `geo: null`
- The `uwbg` calendar was not previously covered by the existing UW Trumba calendars batch (PR #282)
- Implemented as `sources/external/uw-botanic-gardens.yaml` — 34 events confirmed in local build
