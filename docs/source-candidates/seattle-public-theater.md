---
name: "Seattle Public Theater"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-05-20
tags: [Theatre, "Green Lake"]
pr: 371
---
**Seattle Public Theater** — `https://www.seattlepublictheater.org/calendar-2` — 7312 W Green Lake Dr N, Seattle, WA 98103 (Green Lake neighborhood). Squarespace site with confirmed `?format=json` endpoint returning 5 future events.

Previous investigation (2026-05-16) incorrectly probed `/current-season` (a page type, itemCount: 0). The correct events collection URL is `/calendar-2` which uses `typeName: events-stacked`.

Investigated 2026-05-20:
- Squarespace confirmed (events-stacked collection, itemCount: 96 total)
- `/calendar-2?format=json` returns 5 confirmed future events in `data.upcoming`
- All 5 events are performances of "Aviatrix" (May 21–24, 2026)
- End times included (shows run ~2 hours)
- Location data in Squarespace records uses NYC placeholder — ripper geo provides correct coordinates
- Tags: Theatre, Green Lake
- Implemented as `type: squarespace` ripper — no custom code needed
