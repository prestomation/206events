---
name: "Georgetown Pizza & Arcade"
status: added
platform: "Recurring (Squarespace page, static prose, no events collection)"
url: https://www.gpaseattle.com/play
tags: ["Georgetown", "Gaming"]
firstSeen: 2026-07-29
lastChecked: 2026-07-31
pr: 1065
---

Pizza/pinball arcade in Georgetown (5513 Airport Way S, Seattle, WA 98108).

Investigated 2026-07-29:
- `/play` returns HTTP 200, confirmed Squarespace (`squarespace.com` CDN
  assets) but the events are static menu-style text blocks, not a real
  Squarespace events collection (`?format=json` would return a `page`
  type, not `events-stacked` — matches the pattern seen on several other
  Squarespace "page describes recurring stuff in prose" candidates)
- Two distinct monthly pinball tournaments described in page text:
  - "Pingolf" — 2nd Sunday of the month, 3:30pm signups / 4pm start
  - "Last Sunday Detention Match Play" — last Sunday of the month, 3:30pm
    signups / 4pm start
- Fits the `sources/recurring/` multi-schedule pattern (one file, two
  `schedules:` entries — "2nd Sunday" and "last Sunday" — per the AGENTS.md
  convention for a venue with more than one schedule)
- Not implemented this cycle (one-source-per-cycle rule; Seattle Tech
  Mixer picked instead as the higher-confidence built-in-type source)

Implemented 2026-07-31: geocoded via Nominatim to a direct OSM node match
(`node/2396888057`, 5513 Airport Way S, Seattle, WA 98108). Since the two
tournaments are distinct named events with different entry costs ($10
Pingolf vs $5 Detention Match Play), they were split into two
single-schedule recurring files rather than one multi-schedule file
(`cost`/`friendlyname`/`description` are event-level fields in the
recurring schema, so they can't vary per schedule entry within one file) —
following the same pattern as `blue-highway-games-puzzle-exchange.yaml` /
`blue-highway-games-friday-game-night.yaml`:
- `sources/recurring/georgetown-pizza-and-arcade-pingolf.yaml` (2nd Sunday, $10)
- `sources/recurring/georgetown-pizza-and-arcade-detention-match-play.yaml` (last Sunday, $5)
