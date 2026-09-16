---
name: "dma.space"
status: added
pr: 1517
platform: ICS (public Google Calendar)
url: https://dma.space/
tags: [Community, "Capitol Hill"]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
---

Community hackerspace/makerspace at 1517 12th Ave Suite 207, Seattle, WA
98122 (Madison Valley / Capitol Hill), in the Ballou Wright Building next
to Overcast Coffee. Hosts open social nights, a ham radio "Radio Night"
(with periodic license testing), a Tuesday "t4tuesday night", tabletop
game nights, and members meetings.

Investigated 2026-09-16:
- Homepage embeds a public Google Calendar (`#calendar` section) with
  both an interactive embed and a direct **ICS export link**:
  `https://calendar.google.com/calendar/ical/c_05d84e50144f94ecc8f03618c316421e422457d37df1d416b788dedff060df85%40group.calendar.google.com/public/basic.ics`
- Confirmed live via direct fetch: HTTP 200, valid `VCALENDAR`, 53
  `VEVENT` entries.
- Multiple open-ended recurring series still active past today
  (2026-09-16, no `UNTIL` in the past): "t4tuesday night" (weekly
  Tuesdays), "Open Social Night" (weekly Fridays), "Radio Night" (monthly,
  1st Monday), "Radio Night (HAM Test)" (monthly, 3rd Monday), "Members
  Meeting" (monthly, 3rd Friday) — so the feed produces real future
  occurrences, not just historical entries.
- Address confirmed via Nominatim, which has a dedicated OSM node named
  "dma.space" itself (`leisure=hackerspace`): osm node 2158761242,
  47.6145945, -122.3172425.
- Not a religious org; not previously covered under `sources/` or
  `sources/external/`.
- This is the ICS best-case per the calendar integration priority order —
  no custom parser needed.
