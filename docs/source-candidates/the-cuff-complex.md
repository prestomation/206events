---
name: "The Cuff Complex"
status: candidate
platform: Squarespace
url: https://www.cuffcomplex.com/events
tags: [Nightlife, "Capitol Hill"]
firstSeen: 2026-07-22
lastChecked: 2026-07-22
---

Long-running Capitol Hill gay nightclub/leather bar at 1533 13th Ave —
three bars, a dance floor, and a patio. Hosts DJ nights, karaoke, line
dancing, tea dances, and an annual Cuff Pride Fest.

Investigated 2026-07-22:
- Confirmed Squarespace events collection (`/events?format=json` →
  `collection.typeName: "events-stacked"`, `collection.itemCount: 961`)
- `upcoming` is currently empty (`0` events); `past` shows a healthy,
  active cadence through late June 2026 (Cuff Pride Fest 2026-06-27,
  Fluffy Cuff Karaoke, Sunday Tea Dance, Chomper, Cafénico & Fantim) —
  the venue simply hasn't posted July's calendar onto Squarespace yet
  as of this check, not a dead/broken feed
- Per the "200 + 0 events" rule, do not implement yet
- 🔥 High confidence for next cycle — real, actively-maintained
  Squarespace events collection; just needs `upcoming` to repopulate
