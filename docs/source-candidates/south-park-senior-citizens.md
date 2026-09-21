---
name: "South Park Senior Citizens"
status: added
platform: "ICS feed (WordPress / The Events Calendar)"
url: https://www.spseniors.org/events/
tags: ["Community", "South Park"]
firstSeen: 2026-09-21
lastChecked: 2026-09-21
pr: 1554
---

**South Park Senior Citizens** — `https://www.spseniors.org/events/` —
senior center at South Park Neighborhood Center, 8201 10th Ave S, #4,
Seattle, WA 98108 (South Park neighborhood). Runs community dining,
recurring fitness classes (EnhanceFitness, Zumba), cultural celebrations,
karaoke, Lotería y BINGO, a book club, senior tech support, and social
services drop-ins.

Investigated 2026-09-21:
- WordPress site running The Events Calendar (Tribe Events) plugin —
  confirmed via `x-tec-api-root: https://www.spseniors.org/wp-json/tribe/events/v1/`
  response header on the events page.
- `https://www.spseniors.org/events/?ical=1&eventDisplay=list` returns a
  valid ICS feed directly (HTTP 200, `content-type: text/calendar`) from
  this environment — no proxy needed.
- 30 VEVENTs, all with future `DTSTART`s, every one carrying the same
  structured `LOCATION` (South Park Neighborhood Center address).
- "South Park" was not yet a registered neighborhood tag — added to
  `city.config.ts`'s `neighborhoods` list in the same PR.

Implemented as `sources/external/south-park-senior-citizens.yaml` — best-case
ICS integration, no custom code. `sourceRole: venue`, fixed `geo` (Nominatim
building match, `osmType: way`, `osmId: 224019307`). Tags `Community`,
`South Park`. Verified via `ONLY_SOURCE=south-park-senior-citizens npm run
generate-calendars`: 30 events, 0 errors, 0 geocode errors. Full `npm run
test` (3958 tests, 225 files) green.
