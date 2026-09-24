---
name: "Renton Downtown Partnership"
status: added
platform: Squarespace
url: https://www.rentondowntown.com/events/
tags: [Community, Renton]
firstSeen: 2026-09-24
lastChecked: 2026-09-24
pr: 1594
---

Business-improvement organization for Downtown Renton (King County). Hosts
neighborhood-wide events like the "Olde Fashioned Halloween Party" and the
"Gobble Wobble Wine Walk", distinct from `renton-civic-theatre` (single-venue
theater) already tracked separately.

Investigated 2026-09-24:
- Squarespace confirmed (`squarespace-cdn.com` asset URLs, `Squarespace` server header)
- `/events/?format=json` returns a real `events-stacked` collection with
  `upcoming: 2` (Olde Fashioned Halloween Party — Oct 24, 2026; Gobble Wobble
  Wine Walk — Nov 21, 2026), both confirmed future via raw `startDate` epoch
  timestamps
- No per-event `location` (Squarespace map field left at its default), so
  implemented as `sourceRole: aggregator`, `geo: null` (same pattern as
  `first-hill-improvement-association`) rather than a single fixed venue
- Implemented as `sources/renton_downtown_partnership/ripper.yaml`
  (`type: squarespace`), verified via
  `ONLY_SOURCE=renton-downtown-partnership npm run generate-calendars`:
  **2 live events, 0 errors**
