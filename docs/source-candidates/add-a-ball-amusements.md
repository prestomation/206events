---
name: "Add-a-Ball Amusements"
status: added
pr: 1061
platform: "Recurring (static page prose, no dated feed)"
url: https://add-a-ball.com/events/
tags: ["Gaming", "Fremont"]
firstSeen: 2026-07-29
lastChecked: 2026-07-30
---

Pinball arcade in Fremont (315 N 36th St, Seattle, WA 98103).

Investigated 2026-07-29:
- `/events/` returns HTTP 200, static WordPress page (not JS-rendered, no
  Tribe Events/ICS plugin detected)
- Page text describes a fixed weekly cadence: "Weekly Round Robin
  tournaments: Wednesday @ 8:00PM, $5 buy-in" — not a per-event dated
  listing
- Fits the `sources/recurring/` pattern (single weekly schedule, similar
  to the trivia-night entries) rather than a ripper — no ripper code
  needed, just a YAML schedule entry
- Not implemented this cycle (one-source-per-cycle rule; Seattle Tech
  Mixer picked instead as the higher-confidence built-in-type source)

Implemented 2026-07-30: added `sources/recurring/add-a-ball-amusements.yaml`
with a single `every Wednesday` 20:00 PT2H schedule entry, `cost: 5`, and
`tags: [Gaming, Fremont]`. Address confirmed via Nominatim — exact OSM POI
match (`node/2565919678`, `leisure=amusement_arcade`, name "Add-a-Ball") at
47.6520035, -122.3549055.
