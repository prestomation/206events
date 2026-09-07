---
name: Asylum Collective
status: investigating
platform: Squarespace
url: https://www.asylumcollective.org/calendar
tags: [Arts, Nightlife, Pioneer Square]
firstSeen: 2026-09-07
lastChecked: 2026-09-07
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
