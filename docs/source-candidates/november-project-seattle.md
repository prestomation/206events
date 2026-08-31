---
name: "November Project Seattle"
status: blocked
platform: Custom site (SiteGround-protected) + Meetup
url: https://november-project.com/seattle-wa/
tags: [Fitness, Outdoors]
firstSeen: 2026-08-31
lastChecked: 2026-08-31
---

Free, volunteer-led fitness community with weekly workouts (Wednesdays
at the Seattle Center steps, rotating Friday locations across the
city).

Investigated 2026-08-31:
- Main site (`november-project.com/seattle-wa/`) returns an HTTP 202
  SiteGround `sgcaptcha` bot-challenge interstitial from this
  environment — same signature as several other blocked leads this
  cycle (International Examiner, Garden Love, meeples-games,
  meaningful-movies).
- The group's Meetup page (`meetup.com/november-project-seattle/events/`)
  loads (HTTP 200) but is a client-rendered React app — no JSON-LD or
  inline event data in the static HTML, so not scrapable via plain
  fetch (same limitation noted for other Meetup-hosted candidates like
  Seattle Green Lake Running Group).
- Also a rotating-location format (Friday workouts move venue weekly)
  complicates a fixed `sources/recurring/` entry even if data were
  reachable.
