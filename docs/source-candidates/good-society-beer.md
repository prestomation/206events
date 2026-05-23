---
name: "The Good Society Beer"
status: added
platform: WordPress / Tribe Events ICS
url: https://goodsociety.beer/
tags: [Beer, "West Seattle", QueenAnne]
firstSeen: 2026-05-23
lastChecked: 2026-05-23
pr: 388
---

Taproom with two Seattle locations: West Seattle (2701 California Ave SW Unit A) and Queen Anne (535 W McGraw Street). Weekly events include Trivia, Music Bingo, Pilates & Brews, and Run Clubs. Occasional specials like West Seattle Art Walk and Members' Night.

WordPress / Tribe Events ICS feed confirmed working (HTTP 200, valid VCALENDAR):
- `https://www.goodsocietybeer.com/?post_type=tribe_events&ical=1&eventDisplay=list`
- 30 upcoming event instances across 9 unique event types
- Each event has a LOCATION field specifying the branch

Added as `sources/external/good-society-beer.yaml` with `geo: null` (multi-location).
