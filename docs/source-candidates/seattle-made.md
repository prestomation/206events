---
name: "Seattle Made"
status: added
platform: WordPress (The Events Calendar / Tribe Events)
url: https://www.seattlemade.org/events/
tags: [MakersMarket, Community]
firstSeen: 2026-07-10
lastChecked: 2026-07-10
pr: 906
---

Nonprofit supporting Seattle-area makers and manufacturers. Publishes a
Tribe Events ICS feed covering studio tours, tastings, pop-up markets,
design showcases, and open houses — including the annual Seattle Made
Week (12th year in 2026).

Investigated 2026-07-10:
- Confirmed WordPress with The Events Calendar plugin (`/wp-json/tribe/events/v1/events`
  returns structured event data; `?post_type=tribe_events&ical=1&eventDisplay=list`
  returns a valid ICS feed)
- 4 upcoming events confirmed at time of check (Seattle Made Week 2026,
  Shoddy not Shoddy Design Challenge, Reuse Commons Lake City Open House,
  Taste of the Sound)
- Multi-location (events hosted at different member venues across
  Seattle) — `geo: null`, `sourceRole: aggregator`
- Not previously covered in `sources/` or `sources/external/`
- Added as `sources/external/seattle-made.yaml`
