---
name: City of Bothell
status: added
platform: ICS (CivicPlus common/modules/iCalendar)
url: https://www.bothellwa.gov/calendar.aspx?CID=23
tags: [Community, Bothell]
firstSeen: 2026-09-24
lastChecked: 2026-09-24
pr: 1595
---

City of Bothell community calendar. Same CivicPlus "Calendar.aspx"
platform already used by `city-of-redmond-community-events` — the
category listing page (`/calendar.aspx?CID=23`) links out to a direct
GET-able ICS feed per category via
`/common/modules/iCalendar/iCalendar.aspx?catID=<id>&feed=calendar`
(found in the page's "Subscribe to iCalendar" section, `catID=23` =
"City of Bothell Events"). Verified live: 21 `VEVENT`s, future dates
into 2027, mix of pet fairs, coworking meetups, a tabletop RPG series,
trick-or-treat, a careers expo, and city holiday-closure notices.

Confirmed via `ONLY_SOURCE=city-of-bothell npm run generate-calendars`:
21 events, 0 fatal errors (3 non-fatal `GeocodeError`s on locations with
embedded HTML markup in the address string — same class of gap other
city ICS sources have, left for the geo-resolver queue rather than
blocking this add).

Other Bothell CivicPlus categories exist (`catID=64` Board/Commission,
`catID=38` Council meetings, `catID=67` Facilities, `catID=37` Police)
but weren't added — meetings/facilities calendars are lower-signal than
the general Events feed used here, matching how Mercer Island/Redmond
only pull their community-events category.
