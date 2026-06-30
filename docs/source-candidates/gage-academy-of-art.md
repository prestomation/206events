---
name: "Gage Academy of Art"
status: notviable
platform: ARTdynamix (Dream Warrior Group)
url: https://gageacademy.org/calendar/
tags: [Arts, "South Lake Union"]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
---

**Gage Academy of Art** — `https://gageacademy.org/calendar/` — community art school and gallery with locations in South Lake Union (2107 Westlake Ave) and Belltown. Hosts art exhibitions, "Art Parties" (social painting events), Master Artist lecture series, and seasonal markets.

Investigated 2026-06-30:
- Uses **ARTdynamix® by Dream Warrior Group** — a proprietary arts organization management platform (same platform as Pratt Fine Arts Center)
- `/calendar/` page loads but shows "All Events by date" with no populated event data in the HTML; events likely require JS rendering via the ARTdynamix API
- `/events/` returns HTTP 404
- No ICS feed, no Eventbrite, no Squarespace, no Tribe Events
- 1 upcoming exhibition confirmed from the `/events` page: "Best of Gage Student Exhibition" (June 12 – August 14, 2026 at Gage South Lake Union)

**Verdict:** Not viable — ARTdynamix is a proprietary system with no publicly documented ICS/API export. Would require custom browser-side scraping of their calendar widget. Revisit if they migrate to a standard platform.
