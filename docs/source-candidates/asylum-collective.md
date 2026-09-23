---
name: Asylum Collective
status: notviable
platform: Squarespace
url: https://www.asylumcollective.org/calendar
tags: [Arts, Nightlife, Pioneer Square]
firstSeen: 2026-09-07
lastChecked: 2026-09-23
pr:
---

Nonprofit arts/event space at 108 S Jackson St Ste B, Pioneer Square —
dance parties, art workshops, and community gatherings ("underground and
plant-covered"). Also lists shows on Resident Advisor and Eventbrite.

Investigated 2026-09-07: confirmed Squarespace (`server: Squarespace`
header). `/calendar?format=json` returns a valid events collection
(`eventView: 1`, `itemCount: 7`) but **0 upcoming events at time of
check** — the 4 items returned in `past` are dated 2025 (`FEMME FATALE`,
`ART WALK`). Per the new-source gate, do not implement while `upcoming`
is empty. Re-check next cycle; if the calendar has been refreshed with
future dates this is a 🔥 High-confidence Squarespace add.

Re-checked 2026-09-09: `/calendar?format=json` still 0 upcoming events (4 `past`). No change.

Re-checked 2026-09-11: `/calendar?format=json` still 0 upcoming events (4 `past`). No change.

Re-checked 2026-09-23: `/calendar?format=json` still has 0 `upcoming` (only the same 2025 `past` items); `/events` is now a plain Squarespace page with no events collection, calendar block, or embedded ticketing links (Eventbrite/RA/DICE). The on-site calendar has not been maintained for a year and events are announced elsewhere (socials/RA). Closing as `notviable`; reopen if the Squarespace calendar starts carrying future dates again.
