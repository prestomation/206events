---
name: Vortex Pottery Classes
status: candidate
platform: Squarespace
url: https://vortexpottery.com/pottery-classes-seattle-washington
tags: [Creation]
firstSeen: 2026-08-14
lastChecked: 2026-09-11
---

Seattle pottery studio offering wheel-throwing and handbuilding classes.

Real, live site (517 Aloha St, Seattle, WA 98109), built on Squarespace
(squarespace-cdn.com asset URLs). Page lists ~5 recurring class offerings
with day/time (e.g. "Beginners Wheel, Mondays 6-9pm, 8 classes, $525") for
the current Fall session rather than a dated events calendar. Low volume,
recurring-class structure — a good fit for the `sources/recurring/` pattern
(one entry per weekly class slot) rather than a discrete-event ripper. Not
already covered, not religious.

Re-checked 2026-09-11: the page has changed shape since the August pass —
it's now rendered as a Squarespace commerce/subscription product listing
("from {price} every month/week" billing text) rather than prose
describing day/time class slots. The specific "Beginners Wheel, Mondays
6-9pm" text found in August is no longer present in the fetched HTML.
Would need a fresh investigation of the new page structure (product
listing may include per-class schedule metadata, or may not expose
day/time at all) before this can move forward as a recurring-YAML
candidate. No change to status.
