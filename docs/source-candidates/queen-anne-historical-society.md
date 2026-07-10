---
name: "Queen Anne Historical Society"
status: candidate
platform: Squarespace
url: https://www.qahistory.org/calendar
tags: [Arts, QueenAnne]
firstSeen: 2026-07-10
lastChecked: 2026-07-10
---

Neighborhood historical society running walking tours, architecture talks,
and preservation-awards events around Queen Anne.

Investigated 2026-07-10:
- Squarespace confirmed (`static1.squarespace.com` asset URLs).
- `/calendar?format=json` returns a real events collection, but
  `data.upcoming` is empty (`[]`) as of this check — all 28 entries are in
  `data.past`, most recently a June 2026 preservation-awards event and a
  walking tour. Per the quality-gate rule for Squarespace sources (must
  have at least one *future* event at time of check), this doesn't clear
  the gate today.
- The society runs events seasonally (spring/summer walking tours, a fall
  awards celebration) rather than year-round, so `upcoming` emptying out
  between programs is plausible rather than a sign the calendar is dead.

Re-check later in the year (their prior season ran spring through fall) —
if `?format=json` shows `data.upcoming` populated with a future `startDate`,
this is a straightforward Squarespace source to implement.
