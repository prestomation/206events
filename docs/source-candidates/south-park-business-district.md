---
name: "South Park Business District"
status: candidate
platform: Squarespace
url: https://www.southparkbusinessdistrict.com/events
tags: [Community, "South Park"]
firstSeen: 2026-06-10
lastChecked: 2026-06-10
---
**South Park Business District** — `https://www.southparkbusinessdistrict.com/events` — Community and business events in Seattle's South Park neighborhood (underrepresented in 206.events).

Investigated 2026-06-10:
- Squarespace confirmed (`events-stacked` collection type)
- `?format=json` returns events data
- 1 upcoming event: SOPASUPA + RIVER FEST! on Saturday, August 8, 2026 (annual South Park summer party by Duwamish River Community Coalition)
- Low volume — monitoring for more events before implementing
- Address context: South Park neighborhood, Seattle, WA 98108

Next steps: Re-check when more events are posted. If consistently low-volume, add with `expectEmpty: true` after at least one successful CI build.
