---
name: "Sync Seattle"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/sync-seattle-45161572473
tags: [Community]
firstSeen: 2026-07-04
lastChecked: 2026-07-08
pr: 880
---

Community organizer holding space for Black Seattle and allies — hosts a
recurring networking mixer, "Vibes After 5", on the third Thursday of each
month.

Investigated 2026-07-04:
- Eventbrite organizer id `45161572473`, verified via the public
  `eventbrite.com/api/v3/organizers/45161572473/events/?status=live`
  endpoint: **1 live upcoming event** — "Vibes After 5 - Summer Happy Hour
  Mixer" (Jul 16, 2026).
- 🟡 Medium confidence — built-in `eventbrite` type, organizerId confirmed
  working, but only one event is posted at a time (next month's mixer goes
  up after the current one passes), so volume will look thin between
  postings. Per the "low-volume sources are valid" directive, still worth
  implementing — a monthly recurring community mixer is a legitimate,
  narrow but real source, not a one-off.
- Not currently covered elsewhere in `sources/` or `sources/external/`.

Implemented 2026-07-08: `sources/sync_seattle/ripper.yaml` (built-in
`eventbrite` type, `geo: null`, `sourceRole: venue` — organizer hosts events
at rotating locations, following the `tone-circle-seattle` pattern). PR #880
build confirmed 1 event ("Vibes After 5 - Summer Happy Hour Mixer",
2026-07-16). Amazon Q review clean, no blocking issues.
