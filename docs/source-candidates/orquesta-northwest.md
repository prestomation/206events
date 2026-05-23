---
name: "Orquesta Northwest"
status: added
platform: Squarespace
url: https://www.orquestanw.org/eventcalendar
tags: [Music, Arts, Community]
firstSeen: 2026-05-21
lastChecked: 2026-05-23
pr: 392
---

**Orquesta Northwest** — Seattle Latin jazz/salsa orchestra. Events at various Seattle venues.

Investigated 2026-05-21:
- Squarespace site (`eventcalendar?format=json` returns `events-stacked` collection, `itemCount: 97`)
- `data.upcoming` has 1 event: "2026 A Celebration of Community" (startDate 1780261200 ≈ May 31, 2026)
- Very low current volume — only 1 upcoming event
- Re-check in fall when new season programming is announced
- Could add as `expectEmpty: true` candidate once season is confirmed

Implemented 2026-05-23 — Squarespace ripper, tags: Music, Arts, Community. PR #392.
