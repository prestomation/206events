---
name: "Kenyon Hall"
status: added
firstSeen: 2026-05-18
lastChecked: 2026-05-18
tags: [Music, Comedy, Arts, "West Seattle"]
pr: pending
---
**Kenyon Hall** — `https://www.kenyonhall.org/events` — 7904 35th Ave SW, Seattle, WA 98126 (West Seattle). Squarespace site with ~40 upcoming events.

Investigated 2026-05-18:
- Squarespace confirmed (squarespace-cdn.com image URLs)
- `/events?format=json` returns valid JSON with 9 confirmed future events in `data.upcoming`
- Events include live music, comedy, workshops, and community performances
- Regular programming: Pocket Sessions (First Tuesday), 12 Tales Arts Workshop (Third Tuesday), monthly Cabaret
- Implemented as `sources/kenyon_hall/` using `type: squarespace`
- Tags: Music, Comedy, Arts, West Seattle
