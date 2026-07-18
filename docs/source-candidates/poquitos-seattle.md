---
name: "Poquitos Seattle"
status: candidate
platform: Squarespace
url: https://www.vivapoquitos.com/upcoming-events
tags: [Nightlife, "Capitol Hill"]
firstSeen: 2026-07-18
lastChecked: 2026-07-18
---
Mexican restaurant/bar on Capitol Hill hosting a recurring monthly
**Copacabana Drag & Burlesque Brunch** (hosted by Clara Voyance), plus
occasional specials (holiday brunch, Latin Night, Dia de los Muertos
fundraiser).

Investigated 2026-07-18:
- Confirmed Squarespace with a real Events collection (`?format=json` →
  `collection.typeName: "events-stacked"`, `collection.itemCount: 16`)
- `upcoming` array is currently **empty** — 14 `past` events found, most
  recent Mar 21, 2026 (`Copacabana Drag & Burlesque BRUNCH`,
  `startDate: 1774119600787`); no future occurrence has been posted yet
  despite the event being described as monthly
- Fails the Squarespace quality-gate check (no `startDate > Date.now()`
  in `upcoming`/`past`/`items`) — do not implement yet
- Re-check next cycle; if the next Copacabana date is posted this
  becomes a 🔥 High-confidence Squarespace candidate
