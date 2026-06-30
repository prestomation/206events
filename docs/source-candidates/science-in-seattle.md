---
name: "Science in Seattle"
status: added
platform: WordPress / Tribe Events ICS
url: https://scienceinseattle.com/events/list/
tags: [Education, Community]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
pr: pending
---

**Science in Seattle** — `https://scienceinseattle.com/events/list/` — community calendar covering life-science conferences, symposiums, networking, and workshops in the Seattle area (academia, industry, biotech, pharma), plus science pub nights. Event organizers submit their own listings, so this is a community aggregator rather than one org's own events.

Investigated 2026-06-30:
- WordPress / Tribe Events confirmed
- ICS feed `https://scienceinseattle.com/events/?post_type=tribe_events&ical=1&eventDisplay=list` returns HTTP 200 with a valid VCALENDAR
- 9 upcoming events confirmed, all at Seattle venues: Ravenna Brewing Co. (Science on Tap), 188 E Blaine St (Life Science WA Summer Social), Allen Institute x3 (Cascadia Mucosal Biology Symposium, Emerging Connectomics Workshop, Stem Cell & Developmental Biology Symposium), Fred Hutch (Dr. E. Donnall Thomas Symposium), Fremont Studios (Launch a New Era IN Discovery), The 5th Avenue Theatre (An Evening with Bill Nye), Pacific Science Center (Brewology)
- `geo: null` (community calendar, multi-venue), `sourceRole: aggregator` (republishes other orgs' events)
- Added as `sources/external/science-in-seattle.yaml`, no proxy needed (rung 1, direct fetch works)
