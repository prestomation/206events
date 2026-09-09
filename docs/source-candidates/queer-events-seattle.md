---
name: "Queer Events Seattle"
status: candidate
platform: Squarespace
url: https://www.queereventsseattle.org/events-calendar
tags: [Community]
firstSeen: 2026-09-09
lastChecked: 2026-09-09
pr:
---

Distinct from the already-added `queer-power-alliance.org` (different
domain, different Squarespace site, different org) — surfaced via a
"Seattle queer LGBTQ events calendar" search.

Investigated 2026-09-09:
- Squarespace confirmed (`?format=json` responds, `SQUARESPACE.CONTEXT`
  present, collection title "Events Calendar")
- `/events-calendar?format=json` returns `upcoming: 0`, `past: 1` (a
  single "Gays Eating Garlic Bread in the Park" event from the past) —
  the site looks largely dormant
- Platform is confirmed working (🟡 Medium tier once it has content), but
  there is currently nothing to scrape

Keep as `candidate`; re-check `?format=json` in a future cycle for
`upcoming > 0` before implementing.
