---
name: "West Seattle Runner"
status: added
platform: Squarespace
url: https://www.westseattlerunner.com/events
tags: [Running, West Seattle]
firstSeen: 2026-05-24
lastChecked: 2026-05-24
pr: 397
---
**West Seattle Runner** — `https://www.westseattlerunner.com/events` — Squarespace (type: events-stacked) — Tags: Running, West Seattle

Running store and community hub at 2743 California Ave SW. Hosts weekly group runs (Track Tuesday, Wednesday group run, Saturday morning run), injury screening clinics, and sponsored events.

Investigated 2026-05-24:
- Squarespace confirmed; `/events?format=json` returns `collection.typeLabel: events-stacked`
- `data.upcoming` has 5 events (Track Tuesday, Sound PT Injury Screens, Wednesday Group Run, Saturday Morning Run, Pit Viper Track Tuesday)
- All events at 2743 California Avenue Southwest, West Seattle
- Implemented as Squarespace ripper — PR #397

Geo: lat 47.5540, lng -122.3864 (2743 California Ave SW, West Seattle)
