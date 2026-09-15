---
name: Magnolia Yoga and Healing Arts
status: added
platform: Squarespace (Studio Booking Online widget)
url: https://www.magnoliayogaandhealingarts.com/class-schedule
tags: [Wellness, Magnolia]
firstSeen: 2026-08-14
lastChecked: 2026-09-15
pr: 1481
---

Magnolia neighborhood yoga studio offering classes and healing arts sessions.

**Findings (2026-08-14):** Live class-schedule page on a Squarespace site, using a "Studio
Booking Online" widget for signups. Real weekly recurring schedule (Flow I/II, Slow Flow,
Hatha, Chair Yoga, Restorative, Yin, Meditation, Sound Bath — 7am-8:30pm across the week,
some hybrid in-person/virtual). This is a fixed weekly recurring class schedule rather than
one-off dated events — best modeled as a `sources/recurring/` entry (per-class weekly
schedule) rather than a scraped live calendar.

**Implemented 2026-09-15:** the schedule table (`/class-schedule`) is a static HTML `<table>`
inside a Squarespace code block — no JS execution needed to read day/time/class/instructor.
Address confirmed via page footer: 3150 West Government Way, Seattle, WA 98199 (geocoded via
Nominatim). Modeled as 10 `sources/recurring/magnolia-yoga-*.yaml` files, one per distinct
class name, following the existing multi-file-per-venue pattern (`blue-highway-games-*`,
`ccs-seattle-*`): Flow I/II, Hatha Yoga I, Slow Flow, Chair Yoga, Flow & Restore, Meditation,
Gentle Yoga, Flow II/III, Gentle Yoga with Yoga Nidra (1st Friday), Sound Bath (last Friday).
Each class's multiple weekly occurrences are combined into schedule entries within its own
file (e.g. Flow I/II: Monday 9:30am + Thursday 9:30am).

Intentionally **not** implemented — three slots the page itself marks as irregular, which
the `schedule:`/`months`/`seasonal` grammar can't represent without guessing: the Wednesday
7:00-8:15pm slot that alternates weekly between Yin Yoga and Restorative Yoga; the quarterly
(2nd Friday) "Happy Hour" cross-promotion with NBHD Wine Bar; and the Saturday 10:00-11:15am
Flow I/II that only runs "every other week during summer."

15 upcoming events confirmed across the 10 calendars in a local
`ONLY_SOURCE=magnolia-yoga-*` build, 0 parse errors.
