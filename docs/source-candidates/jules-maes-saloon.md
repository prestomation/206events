---
name: "Jules Maes Saloon"
status: added
platform: Recurring (weekly trivia)
url: https://kingtrivia.com/venues/jules-maes-saloon/
tags: [Trivia, "Pub Trivia", Georgetown]
firstSeen: 2026-07-25
lastChecked: 2026-07-27
pr: TBD
---

Seattle's oldest bar (est. 1888), Georgetown neighborhood, 5919 Airport
Way S, Seattle, WA 98108.

- King Trivia — every Tuesday, 7pm
- Also hosts live music, open mic, and comedy nights, but no
  structured/dated calendar found for those beyond the weekly trivia —
  King Trivia's venue page is the only source with a consistent,
  verifiable weekly schedule.
- No ICS/API — fits `sources/recurring/jules-maes-saloon.yaml` (single
  weekly schedule entry), same pattern as `admiral-pub-trivia.yaml` /
  `hitc-trivia-saint-johns.yaml`.
- Not already covered — checked `sources/`, `sources/external/`,
  `sources/recurring/`, and `docs/source-candidates/` for "jules maes"
  and "georgetown" trivia; no match.

Sources:
- https://kingtrivia.com/venues/jules-maes-saloon/
- https://georgetownseattle.org/venue/jules-maes-saloon/

Implemented 2026-07-27: `sources/recurring/jules-maes-saloon.yaml`, single
`every Tuesday` schedule at 19:00 (2h), geocoded via Nominatim to the
confirmed OSM node (`osmType: node`, `osmId: 2396891247`). Verified
locally with `ONLY_SOURCE=jules-maes-saloon npm run generate-calendars`
— 1 event generated, 0 errors.
