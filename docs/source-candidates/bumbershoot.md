---
name: "Bumbershoot"
status: added
platform: recurring
url: https://bumbershoot.com/
tags: [Music, Arts, QueenAnne]
firstSeen: 2026-05-30
lastChecked: 2026-06-03
pr: 468
---

Annual multi-day arts and music festival at Seattle Center over Labor Day
weekend. 2026 dates: September 5-6. Free or ticketed depending on the
stage. Website lists a schedule of acts but no ICS feed.

No ICS feed found. The website uses custom JS (no discoverable API). Added
as `sources/recurring/bumbershoot.yaml` using `schedule: "1st Saturday"` and
`schedule: "1st Sunday"` with `months: [9]` — approximates Labor Day weekend
(the Saturday-Sunday before the first Monday of September). Works correctly
for 2026 (Sep 5-6) and most years; may be off by one week in years when
Labor Day falls on September 1.
