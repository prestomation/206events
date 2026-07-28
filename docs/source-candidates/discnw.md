---
name: DiscNW (Northwest Ultimate Association)
status: candidate
platform: Custom HTML
url: https://www.discnw.org/en_us/e
tags: [Sports]
firstSeen: 2026-07-28
lastChecked: 2026-07-28
pr:
---

Regional ultimate frisbee and disc golf governing body running leagues,
tournaments, and camps across Seattle-area venues (e.g. Jackson Park Golf
Course), with some events in Bellevue and other Eastside cities. Runs on
Ultimate Central/TopScore.

No ICS feed or public API discovered despite checking for a widget/JSON
endpoint. The event list at `/en_us/e` is server-rendered in the raw HTML
(confirmed via `curl`, not JS-only), so a static `HTMLRipper` is viable.
Confirmed real upcoming events spanning June-October 2026 (e.g. "2026 Summer
Masters Mixed Hat League", "2026 Fall Mixed Hat League", "2026 Fall HS Bx
Seattle Invite").

🔴 Low confidence — needs custom HTML scraping. The markup is dense with
many auto-generated asset-cache script tags, so parsing will need care to
isolate the `#event-list-*` block. `sourceRole` should likely be
`aggregator` (lists tournaments/leagues across many venues, not one
physical location) with per-event `geo` where a venue is identifiable.
