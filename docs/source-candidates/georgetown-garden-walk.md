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
- `www.georgetowngardenwalk.com` returns HTTP 200 headers but a 0-byte body
  from this environment — no page content to inspect
- Single self-guided annual walking tour, no calendar/feed even if the site
  were reachable — one event per year with a loosely-anchored date ("second
  Sunday of July" per the Reddit post, unconfirmed against a stable
  multi-year pattern on the site itself)
- Not worth a dedicated ripper or recurring-YAML entry; too thin to verify a
  reliable annual pattern from an empty response