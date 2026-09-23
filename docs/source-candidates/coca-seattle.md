---
name: "Center on Contemporary Art (CoCA) Seattle"
status: investigating
firstSeen: 2026-05-16
lastChecked: 2026-09-23
tags: [Arts]
---
**Center on Contemporary Art (CoCA) Seattle** — `https://www.cocaseattle.org/events` — Seattle contemporary art center. Squarespace site.

Investigated 2026-05-16:
- Squarespace confirmed (squarespace-cdn.com image URLs)
- Collection type: `events-stacked`
- `upcoming: 1` events returned (only "ART IS NOT DEAD" May 6-17, 2026, ending tomorrow)
- `past: 30` entries (exhibitions from 2025)
- Currently has only 1 expiring event — low volume, not worth adding right now
- Revisit when new programming season is announced

Re-checked 2026-06-04: 0 upcoming events on Squarespace (prior event ART IS NOT DEAD ended May 17). Monitor for new programming announcements.

Re-checked 2026-06-09: Still 0 upcoming events. Monitor for summer/fall programming announcements.

Re-checked 2026-06-13: Still 0 upcoming events.

Re-checked 2026-06-16: Still 0 upcoming events.

Re-checked 2026-06-21: Still 0 upcoming events. Monitor for fall programming announcements.

Re-checked 2026-06-30: Still 0 upcoming events (Squarespace `upcoming: []`). Monitor for fall 2026 programming.

Re-checked 2026-07-02: Still 0 upcoming events. Monitor for fall 2026 programming.

Re-checked 2026-07-22: still 0 upcoming events (Squarespace `?format=json` upcoming array empty, or Eventbrite organizer `upcomingEvents` empty). No change.

Re-checked 2026-08-24: still 0 upcoming events (Squarespace `?format=json` upcoming array empty). No change.

Re-checked 2026-09-09: still 0 upcoming events. No change.

Re-checked 2026-09-23: `/events?format=json` still `upcoming: []` (last entry ART IS NOT DEAD, May 2026). The venue is active: the homepage advertises the current exhibition "Between Us" (opened Aug 6, runs through Sep 27, reception Sep 3). But new shows are posted only as static homepage copy, not to the Squarespace events collection (`/exhibitions` is a plain page, `itemCount: 0`). Not implementable via the Squarespace ripper until they post to `/events` again, and homepage-text scraping would be too fragile. Re-check the `/events` collection next cycle.
