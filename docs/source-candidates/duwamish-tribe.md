---
name: "Duwamish Longhouse & Cultural Center"
status: added
platform: Squarespace (newer API format)
url: https://www.duwamishtribe.org/events-1
tags: [Community, Arts, Parks]
firstSeen: 2026-05-29
lastChecked: 2026-05-29
pr: 428
---

**Duwamish Longhouse & Cultural Center** — 4705 West Marginal Way SW, Seattle, WA 98106.
The Duwamish Tribe's cultural center hosting eco-tours, healing circles, song & dance
practices, MMIW awareness events, community meetings, and seasonal cultural programs.

Investigated 2026-05-29:
- Squarespace site confirmed (server: Squarespace header)
- Uses Squarespace 7.1 API format: events at top-level `items` (not `data.upcoming`) in response
- Pagination by month via `?format=json&month=June-2026` query parameter
- 2 upcoming events on May 30, 2026 (Eco-Tour, MMIW Awareness Event)
- June 2026: 9 non-private events (Eco-Tours, Healing Circles, MMIW events)
- July 2026: 5 events (Eco-Tours, Canoe Journey)
- August 2026: 2 events
- Implemented as `sources/duwamish_tribe/` with custom IRipper
- Filters "Private Event" entries and strips "(Copy)" suffix from duplicated entries
- `geo: { lat: 47.5608833, lng: -122.3520189 }` (fixed venue, OSM way/228915487)
- Tags: Community, Arts, Parks
