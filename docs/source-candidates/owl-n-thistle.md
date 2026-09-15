---
name: "Owl 'N Thistle"
status: added
platform: Wix (no ICS/API detected) — implemented as sources/recurring
url: https://www.owlnthistle.com/live-music-schedule
tags: [Music, "Pioneer Square"]
firstSeen: 2026-09-15
lastChecked: 2026-09-15
pr: 1484
---

Irish pub at Post Alley in Pioneer Square with nightly live music. Best
known for its **Tuesday Night Jazz Jam**, a 25+ year Seattle jazz
institution (running continuously since 1997, hosted by Matt Williams).

Investigated 2026-09-15:
- Site (`owlnthistle.com`) is built on **Wix** — no ICS feed, no
  discoverable events API, no Squarespace/Eventbrite/other built-in
  platform.
- `/live-music-schedule` lists a fixed weekly lineup but **only by day of
  week, with no start times**: Sun "Pat Riff, every other Sunday", Mon
  Aqualizer, Tue "Jazz Jam", Thu Danny Godinez, Fri/Sat Irish Cover Band.
- The Tuesday Jazz Jam's start time **is** independently corroborated
  across several third-party sources (Earshot Jazz, All About Jazz's
  "25 Year Legacy" retrospective, a Chris Bickley Jazz performance page,
  and the jam's own Instagram bio `@owljamtuesday`): consistently
  **9:45pm–12:45am**. That's solid enough for a single `sources/recurring`
  entry covering Tuesdays only.
- The other five nights (Sun/Mon/Thu/Fri/Sat) have no corroborated start
  time anywhere — the venue's own site omits it and no third-party
  write-up covers those slots the way the long-running Jazz Jam is
  documented. Per AGENTS.md ("do not guess a default"), not implementable
  yet without guessing a time.

Implemented 2026-09-15: added `sources/recurring/owl-n-thistle-jazz-jam.yaml`
covering the Tuesday 9:45pm–12:45am slot only (corroborated no-cover
policy also confirmed independently). The other five nights (Sun/Mon/Thu/
Fri/Sat) remain unimplemented — no corroborated start time exists for
them. Re-check in a future cycle in case the venue publishes times
(Instagram/Facebook event posts, a menu insert, etc.) — do not guess.
