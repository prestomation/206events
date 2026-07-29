---
name: "Georgetown Pizza & Arcade"
status: candidate
platform: "Recurring (Squarespace page, static prose, no events collection)"
url: https://www.gpaseattle.com/play
tags: ["Georgetown"]
firstSeen: 2026-07-29
lastChecked: 2026-07-29
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

Next steps: confirm exact address/geocode via Nominatim and add as
`sources/recurring/georgetown-pizza-and-arcade.yaml` with both schedule
entries.
