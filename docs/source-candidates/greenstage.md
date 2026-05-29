---
name: "GreenStage Seattle"
status: added
platform: ICS (Tribe Events)
url: https://greenstage.org/sotf/
tags: [Theatre, Arts, Parks]
firstSeen: 2026-05-29
lastChecked: 2026-05-29
pr: 427
---
**GreenStage Seattle** — `https://greenstage.org/sotf/` — Free outdoor Shakespeare performances at parks across Seattle. GreenStage is Seattle's free Shakespeare company, running its Seattle Outdoor Theater Festival (SOTF) each summer at multiple park venues including Wallingford Playfield, Seward Park Amphitheater, Lower Woodland Park, High Point Commons, and others.

Investigated 2026-05-29:
- WordPress site with Tribe Events plugin (confirmed via `x-tec-api-root` response header)
- ICS feed confirmed working: `https://greenstage.org/?post_type=tribe_events&ical=1&eventDisplay=list`
- **30 upcoming events** in 2026 — full summer season (June–August)
- Events span multiple Seattle park locations → `geo: null`
- Added as `sources/external/greenstage.yaml`
