---
name: "Greater Seattle Choral Consortium"
status: notviable
platform: Custom HTML (embedded JS calendarData variable)
url: https://seattlesings.org/calendar/
tags: [Music, Community]
firstSeen: 2026-06-28
lastChecked: 2026-06-28
---
**Greater Seattle Choral Consortium** — `https://seattlesings.org/calendar/` — Consortium of 105 member choirs in the Seattle area. Maintains a shared calendar of choral performances, auditions, and community singing events across the region.

Investigated 2026-06-28:
- Custom WordPress-based site with a proprietary calendar embedded as a JavaScript variable: `var calendarData = {...}` in the page HTML
- No ICS/iCal export found
- No Tribe Events plugin or standard REST API
- Calendar data structure: `{ day_number: { instance_idx: { url, eid, name, description, prices, type, status, nname, instances: { idx: { date, time, url, vid, vname, vstreet, vcity, vstate, vzip, latitude, longitude } } } } }`
- 13 total entries found, 9 with vcity='Seattle'
- Events span July 2026 – June 2027
- sourceRole would be aggregator (republishes member choir events)
- geo would be null (events at many different venues)

**Verdict**: Not viable as-is — requires custom HTML scraper to parse the embedded JS variable. Low event volume (9 Seattle events across 12 months). Not worth implementing given the fragility and maintenance overhead.
