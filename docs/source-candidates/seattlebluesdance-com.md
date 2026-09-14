---
name: "Seattle Blues Dance Collective"
status: added
platform: Custom JSON API
url: https://seattlebluesdance.com
tags: ["Dance", "Music"]
firstSeen: 2026-08-25
lastChecked: 2026-09-14
pr: 1471
---

Nonprofit that curates blues-dance socials, classes, and live-music nights
across many Seattle venues (Reverie Ballroom, Black & Tan Hall, Bacovino
Winery, Dance Underground, and more). Originally discovered via aggregator
gap analysis under a single sample event ("Hillman City Sway").

Investigated 2026-09-14:
- The `/calendar` page is client-rendered, but it calls its own public,
  unauthenticated JSON API directly: `GET /events.json?month=<1-12>&year=<yyyy>`
  (found in the page's inline `loadEvents()` fetch call).
- Confirmed live: clean structured JSON (`date`, `time`, `title`,
  `description`, `location`, stable `uid`) — 18-24 events per monthly
  query, each request actually returning a rolling several-week window
  (a September query already included October dates), so a handful of
  monthly requests a few months apart cover the full lookahead with
  overlap, deduped on the API's own `uid`.
- `sourceRole: aggregator`, `geo: null` — events span many venues, each
  geocoded individually from its own `location` string.
- Implemented as a custom `JSONRipper` (`sources/seattle_blues_dance_collective/`)
  with an overridden `rip()` looping over 6 months. 73 unique upcoming
  events confirmed in a local `ONLY_SOURCE` build, 0 parse errors.

See `sources/seattle_blues_dance_collective/ripper.ts` for implementation
details.
