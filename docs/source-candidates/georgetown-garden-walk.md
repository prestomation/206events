---
name: Georgetown Garden Walk
status: notviable
platform: Unknown
url: http://www.georgetowngardenwalk.com
tags: [Community, Georgetown]
firstSeen: 2026-07-08
lastChecked: 2026-07-09
---

Discovered via r/SeattleEvents post: https://old.reddit.com/r/SeattleEvents/comments/1uk06b5/the_29th_annual_georgetown_garden_walk_is_july/
Post title: "The 29th Annual Georgetown Garden Walk is July 12th!"
Post date: 2026-06-30

Annual free community event in Georgetown. Self-guided tour of private gardens,
always second Sunday of July. 29th year running. Likely a one-off annual event
but may be worth adding to recurring.yaml if there's a predictable date pattern.
Website is very simple — probably custom HTML or a simple CMS, not a
structured event platform.

Re-investigated 2026-07-09:
- Single self-guided annual walking tour — one event per year, no
  calendar/feed of any kind, regardless of whether the site is reachable
- The Reddit post's "second Sunday of July" framing isn't confirmed against
  a stable multi-year pattern on the site itself, so it isn't a safe basis
  for a recurring-YAML entry either
- (`www.georgetowngardenwalk.com` also returns a 0-byte body from this
  environment at time of check, so even a one-off manual scrape isn't
  currently possible — but the structural reason to skip this is the
  single-annual-event shape, not the fetch failure)
- Not worth a dedicated ripper or recurring-YAML entry