---
name: "Greater Seattle Choral Consortium"
status: added
platform: Custom HTML (embedded JS calendarData variable)
url: https://seattlesings.org/calendar/
tags: [Music, Arts]
firstSeen: 2026-06-28
lastChecked: 2026-06-30
pr: pending
---
**Greater Seattle Choral Consortium** — `https://seattlesings.org/calendar/` — Consortium of 105 member choirs in the Seattle area. Maintains a shared calendar of choral performances, auditions, and community singing events across the region.

Investigated 2026-06-28:
- Custom WordPress-based site with a proprietary calendar embedded as a JavaScript variable: `var calendarData = {...}` in the page HTML
- No ICS/iCal export found
- No Tribe Events plugin or standard REST API
- Calendar data structure: `{ day_number: { instance_idx: { url, eid, name, description, prices, type, status, nname, instances: { idx: { date, time, url, vid, vname, vstreet, vcity, vstate, vzip, latitude, longitude } } } } }`

Implemented 2026-06-30:
- Custom `IRipper` implementation (`sources/greater_seattle_choral/ripper.ts`)
- Extracts `var calendarData = {...}` from page HTML using a bracket-counting algorithm
- Filters to Seattle-city events only (`vcity === 'Seattle'`), excludes Auditions
- Stable event IDs: `gscc-{eid}-{YYYY-MM-DD}-{HHMM}`
- 7 upcoming public choral events in Seattle (Jul 2026 – Jun 2027)
- Build result: 7 events, 0 errors
- 14/14 tests passing
