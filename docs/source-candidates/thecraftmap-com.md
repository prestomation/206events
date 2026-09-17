---
name: Bellevue Makers Market: Local Artisanal Crafts, Ceramics & Art
status: added
platform: Unknown
url: https://www.thecraftmap.com/fair/bellevue-makers-market-local-artisanal-crafts-ceramics-art-bellevue-wa
tags: ["markets", "creation"]
firstSeen: 2026-08-25
lastChecked: 2026-09-17
pr:
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: thecraftmap.com.

Sample event: "Bellevue Makers Market: Local Artisanal Crafts, Ceramics & Art" (2026-08-29T00:00:00.000Z)
Description: Discover Bellevue and PNW artisans featuring handmade ceramics, candles, apparel, jewelry, art, and lifestyle goods. Free entry!

**Status fix 2026-09-17:** this domain (thecraftmap.com) is already covered
— `sources/craft_map_seattle` scrapes the same site's
`/fairs/washington/seattle` directory listing (JSON-LD `ItemList` of fair
detail-page URLs, each carrying a JSON-LD `Event` block). This candidate
file predates that source or was filed without checking `sources/` first.
No PR number to record; flipping to `added` to stop this domain from being
re-proposed.
