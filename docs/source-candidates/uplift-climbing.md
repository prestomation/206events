---
name: "Uplift Climbing"
status: candidate
platform: Squarespace
url: https://www.upliftclimbing.com/events
tags: [Sports]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
---
**Uplift Climbing** — `https://www.upliftclimbing.com/events` — climbing gym in SODO hosting community climb nights (She Rocks, Rising Roots, Queer Mountaineers) and social events (BBQ potlucks).

Investigated 2026-06-30:
- Squarespace confirmed (`squarespace-cdn.com` image URLs)
- `/events?format=json` returns `itemCount: 0`, `typeName: "page"` — not a real Squarespace events collection; page text describes recurring climb nights in prose but there is no dated, machine-readable events feed
- Unlike Unicorn (same investigation day), the page does not render individually-dated weekly occurrences — only descriptive blurbs ("July 28 & August 25", etc. embedded in body copy), not a stable per-week pattern suitable for recurring YAML without re-checking dates each month

Re-evaluate if the venue adopts a real Squarespace events collection or a clearer fixed weekly pattern emerges.
