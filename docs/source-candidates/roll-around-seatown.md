---
name: "Roll Around Seatown"
status: notviable
platform: Wix
url: https://www.rollaroundseatown.com/events
tags: []
firstSeen: 2026-07-30
lastChecked: 2026-07-30
---

Seattle roller-skating community group. Runs two recurring events:

- **Weekly Social Skates at Judkins Park** (Central District) — explicitly
  weather-dependent with no fixed day/time; the venue's own page says to
  "follow our Facebook page or Instagram page for notifications" rather than
  publishing a schedule. Not schedulable as a recurring YAML entry (no stable
  pattern to encode).
- **"Seatown Sundays" at Southgate Roller Rink** (White Center) — a themed
  night at Southgate Roller Rink, already covered as the Sunday entry in
  `sources/recurring/southgate-roller-rink-*.yaml` (see
  `docs/source-candidates/southgate-roller-rink.md`, PR #804).

Site itself is Wix (`?format=json` on `/events` returns the SPA shell, no
structured collection) — no API to scrape even if the Judkins schedule were
fixed. Not viable as a standalone source; both of its events are either
unschedulable or already covered.
