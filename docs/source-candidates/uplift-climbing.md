---
name: "Uplift Climbing"
status: notviable
platform: Squarespace
url: https://www.upliftclimbing.com/events
tags: [Sports]
firstSeen: 2026-06-30
lastChecked: 2026-09-23
---
**Uplift Climbing** — `https://www.upliftclimbing.com/events` — climbing gym in SODO hosting community climb nights (She Rocks, Rising Roots, Queer Mountaineers) and social events (BBQ potlucks).

Investigated 2026-06-30:
- Squarespace confirmed (`squarespace-cdn.com` image URLs)
- `/events?format=json` returns `itemCount: 0`, `typeName: "page"` — not a real Squarespace events collection; page text describes recurring climb nights in prose but there is no dated, machine-readable events feed
- Unlike Unicorn (same investigation day), the page does not render individually-dated weekly occurrences — only descriptive blurbs ("July 28 & August 25", etc. embedded in body copy), not a stable per-week pattern suitable for recurring YAML without re-checking dates each month

Re-evaluate if the venue adopts a real Squarespace events collection or a clearer fixed weekly pattern emerges.

Re-checked 2026-08-24: `/events?format=json` still returns an empty page
shell (`data-type="page"`, no events collection). No change.

Re-checked 2026-09-09: still 0 upcoming events. No change.

Re-checked 2026-09-23: `/events?format=json` still returns an empty `page` shell, 0 upcoming events. No change.
Re-checked 2026-09-23: closing as notviable. The site's own Squarespace location block puts Uplift Climbing at 17229 15th Ave NE, Shoreline, WA 98155 (outside Seattle city limits), and `/events?format=json` is still an empty page shell with no dated events collection.

**Re-evaluated 2026-09-23 (King County rule):** Shoreline is now in scope, so geography is no longer the blocker, but there is still no feed. `/events?format=json` is an empty Squarespace `page` shell; the "Calendar" link is just an on-page anchor; the linked Google Sheet is comp results, not a schedule. The page lists about 4 upcoming items in prose (Fall Cup Oct 18, monthly She Rocks / Rising Roots / Queer Mountaineers climb nights with hand-typed dates). That is too few and too irregular for a scraper or recurring YAML. Still notviable; re-check if a real events collection appears.
