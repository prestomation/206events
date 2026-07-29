---
name: "Add-a-Ball Amusements"
status: candidate
platform: "Recurring (static page prose, no dated feed)"
url: https://add-a-ball.com/events/
tags: ["Fremont"]
firstSeen: 2026-07-29
lastChecked: 2026-07-29
---

Pinball arcade in Fremont (315 N 36th St, Seattle, WA 98103 — address
needs confirmation via Nominatim at implementation time).

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

Next steps: confirm exact address/geocode via Nominatim and add as
`sources/recurring/add-a-ball-amusements.yaml` with a single `every
Wednesday` schedule entry.
