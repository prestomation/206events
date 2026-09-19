---
name: "Seattle Cider Taproom"
status: candidate
platform: Eventbrite
url: https://www.eventbrite.com/o/seattle-cider-taproom-95674605773
tags: [Beer, SODO]
firstSeen: 2026-09-16
lastChecked: 2026-09-19
---

Seattle Cider Co.'s taproom in SODO (4660 Ohio Ave S, Seattle), 21+ and
dog-friendly, with a revamped kitchen.

Investigated 2026-09-16:
- Confirmed real Eventbrite organizer: `95674605773` (24 lifetime events
  per the organizer bio's `totalEvents` stat)
- Public `https://www.eventbrite.com/api/v3/organizers/95674605773/events/?status=live`
  returns `object_count: 0` — no live events posted at time of check
- Per the "200 + 0 events" rule, do not implement yet
- Re-check later — a working taproom with a real Eventbrite history is
  likely to post events again

**Re-checked 2026-09-19:** organizer events API still returns
`object_count: 0`. No change.
