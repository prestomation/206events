---
name: "Ballard Senior Center"
status: blocked
platform: unknown
url: https://ballardseniorcenter.org/coming-up/activity-calendar/
tags: [Community, Ballard]
firstSeen: 2026-08-03
lastChecked: 2026-08-03
---

Senior center at 5100 20th Ave NW, Ballard, running a monthly activity
calendar (found while searching "Seattle senior center events
calendar").

Investigated 2026-08-03:
- Plain `curl -A "Mozilla/5.0 (compatible; 206events/1.0)"` to the
  activity-calendar page returns a bare HTTP 403 (201-byte body) — blocked
  from this environment, not just a bot-challenge shell.
- Per the "fetch fails locally too" rule: do not implement, do not stage
  for proxy testing. A source unreachable from anywhere in this
  environment has nothing to prove yet.

Re-evaluate in a future cycle in case the block lifts or the platform
becomes identifiable (a Tribe Events / Squarespace / other fingerprint
would make this a fast add).
