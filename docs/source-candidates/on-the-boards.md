---
name: "On the Boards"
status: candidate
platform: Squarespace
url: https://www.ontheboards.org/events/
tags: [Arts, Dance, "Queen Anne"]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Seattle's leading contemporary performance presenter, hosting dance, theater, and interdisciplinary performance at 100 W Roy St (Queen Anne). Regular season runs Sept–June; Out There festival in spring.

Investigated 2026-06-21:
- Squarespace confirmed (squarespace-cdn.com image URLs)
- Collection: "25/26 Season" (29 items total)
- `?format=json` endpoint: `upcoming: []` (0 upcoming events) — summer/fall gap; the 2026-2027 season has not yet been announced
- Last event in 2025/2026 season: "NW New Works 2026" Jun 4–6, 2026 (past)
- HTTP 200 accessible, no proxy needed
- Each individual event page includes an ICS export link (per-event)

**Next steps**: Re-check in August or September 2026 when the 2026-2027 season is announced and events appear in the Squarespace `upcoming` array. When events appear (expect 8–10 per season), implement as `type: squarespace` with `geo: {lat: 47.6250, lng: -122.3580}` (100 W Roy St, Queen Anne). Tags: Arts, Dance, QueenAnne.
