---
name: Ballard Brewed Coalition
status: candidate
platform: Squarespace
url: https://www.ballardbrewed.com/events
tags: [Beer, Ballard]
firstSeen: 2026-09-28
lastChecked: 2026-09-28
pr:
---

Multi-brewery events coalition covering Ballard-area breweries (e.g. Obec
Brewing, 1144 NW 52nd St). Confirmed Squarespace: `?format=json` on the
events page returns `upcoming`/`past` collections.

Verified 2026-09-28 by fetching
`https://www.ballardbrewed.com/events?format=json`: **21 upcoming
events**, `startDate` epoch values confirmed after today (2026-09-28)
through at least mid-January 2027 — trivia nights, book club, burlesque
cabaret, a French-language happy hour, and more. `location.addressTitle`
values seen across the sample: "Obec Brewing" and "Ballard Brewed
Coalition" itself — multi-venue, so this is a `sourceRole: aggregator`,
`geo: null` source (each event's own `location` object carries lat/lng
per-venue).

**🔥 High confidence** — built-in `squarespace` ripper type, confirmed
`itemCount`/upcoming data with real future timestamps per the skill's
verification standard (epoch values, not description text). Ready to
implement as `sources/ballard_brewed_coalition/ripper.yaml` with
`type: squarespace` next cycle.
