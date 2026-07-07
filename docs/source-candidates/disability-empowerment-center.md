---
name: "Disability Empowerment Center"
status: added
pr: 873
platform: Squarespace
url: https://www.disabilityempowerment.org/events
tags: [Community]
firstSeen: 2026-07-06
lastChecked: 2026-07-07
---

Seattle-based nonprofit (formerly Northwest Center's Center for Independence)
serving people with disabilities across the Seattle area. Hosts recurring peer
support groups (Virtual, Westside, Eastside) and community outings (EPIC
program — e.g. trips to Seattle Art Museum, the waterfront).

Investigated 2026-07-06:
- Squarespace confirmed — `?format=json` on `/events` returns a real
  `events-stacked` collection (not an empty static page)
- 7 upcoming events confirmed via raw epoch `startDate` timestamps (all in
  the future relative to 2026-07-06): July Virtual Peer Group (Jul 14),
  July Westside Peer Group (Jul 16), July Eastside Peer Group (Jul 28),
  August Virtual Peer Group (Aug 11), August EPIC trip to the Seattle
  waterfront (Aug 14), August Westside Peer Group (Aug 20), August Eastside
  Peer Group (Aug 25)
- HTTP 200 from this environment; no proxy needed
- Recurring monthly peer-group programming plus occasional EPIC outings —
  steady low-volume cadence, similar in shape to already-added low-volume
  sources (Shunpike, Book Larder)
- `geo` likely `null` (peer groups meet at rotating Virtual/Westside/Eastside
  locations, EPIC outings at varying destination venues) — confirm exact
  per-event locations before implementing
- 🔥 High confidence — built-in `squarespace` type, verified `itemCount > 0`
  via raw JSON

Implemented 2026-07-07 in PR #873: `sources/disability_empowerment_center/ripper.yaml`,
`sourceRole: venue`, `geo: null`. Verified 9 upcoming events, 0 parse errors via
`ONLY_SOURCE=disability-empowerment-center npm run generate-calendars`.
