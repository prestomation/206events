---
name: Ballard Clay Studio
status: added
platform: Squarespace
url: https://www.ballardclay.com/studio
tags: [Arts, Ballard]
firstSeen: 2026-08-14
lastChecked: 2026-09-03
pr: TBD
---

Ballard neighborhood pottery studio offering classes, studio time, and workshops.

**Checked 2026-08-14:** Confirmed live Squarespace site (CDN image URLs
in markup). Real, current offerings: weekly recurring class series
starting Aug 23-26 2026 (Sunday/Monday/Tuesday/Wednesday/Thursday wheel
& handbuilding classes), plus one-time "Sip N Spin & Try It" sessions
(rolling 4-week registration window). This is recurring-schedule content
rather than discrete dated events — would suit a
`sources/recurring/<name>.yaml` entry (per-weekday schedule) better than
a scraped ripper.

**Implemented 2026-09-03:** Added as `sources/recurring/ballard-clay-studio.yaml`.
Confirmed the current live weekly schedule (Sun 10:30am, Mon/Tue/Wed/Thu
6:30pm — all 3hr wheel/handbuilding series classes) plus the studio's
exact address, OSM way `217332004` (craft=pottery, "Ballard Clay"), and
current 6-week series pricing ($420–440, varies by class type — too
variable to encode as a single `cost:` default, left unset). The studio
also runs a second Thursday 2-5pm class; omitted from the schedule list
to avoid an event-id collision (two `every Thursday` entries in one file
would slugify to the same id, corrupting the uncertainty/photo/cost
cache join key) — 5 distinct weekday schedules is still solidly above
the low-volume bar. Used tag `Arts` instead of the previously-noted
`Creation` to match the existing pottery/craft source
(`saltstone-ceramics`) already on `main`, avoiding a near-duplicate tag.
