---
name: "Rainier Beach Running Club"
status: notviable
platform: WordPress blog (no calendar/API)
url: https://rbrunclub.wordpress.com/
tags: [Sports, "Rainier Beach"]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
---

Casual South Seattle run club (dog- and stroller-friendly) with runs
described as Monday 6pm, Tuesday 6pm, Wednesday 5:30pm, Thursday 6pm,
Saturday 8:30am.

Investigated 2026-09-16:
- No dedicated calendar page — the site is a plain WordPress blog with
  individual posts per upcoming run (e.g. "Sept 7 – Clock-out lounge",
  "July 4 Beacon Hill").
- Meeting location varies week to week and the site itself says to
  "check our Strava group or posts below" for the current spot — unlike
  `capitol-hill-running-club` or `seattle-frontrunners` (both already
  `added` as `sources/recurring/` entries), there's no single stable
  location to anchor a recurring YAML entry against.
- No ICS/API; Strava group posts aren't a scrapable public feed.

**Verdict**: Not viable — no stable schedule/location pattern and no
machine-readable feed. Re-check if the club settles on a fixed weekly
meeting spot.
