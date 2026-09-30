---
name: City of Snoqualmie
status: added
platform: CivicPlus (CivicEngage) — iCalendar module
url: https://www.snoqualmiewa.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar
tags: [Community, Snoqualmie]
firstSeen: 2026-09-26
lastChecked: 2026-09-30
pr:
---

City of Snoqualmie (King County), same CivicPlus platform as Issaquah/
North Bend/Enumclaw. `catID=14` ("Community Events") mixes ~6 genuine
public events ("Snoqualmie Winter Lights", "Trunk or Treat at Snoqualmie
Valley YMCA", "\"Spook\"Tacular Halloween in Snoqualmie", "Mount Si High
School Jazz Ensemble I Day", "Holiday Tree Pick-Up by Local Boy Scout
Troops") with ~8 generic city-office-closure holiday entries (New Year's
Day, MLK Day, Memorial Day, Independence Day, Labor Day, Columbus Day,
Veterans Day, Thanksgiving, Christmas). `catID=62` has a single event
("Ice Cream & Cookies with Mayor Mayhew"). `catID=30` is committee
meetings (skip, as with the other CivicPlus cities).

**Implemented 2026-09-30, no custom filtering needed:** the earlier
"investigating" note worried that the holiday-closure titles would need
a title-exclusion list in a custom ripper. Re-checked the live feed: all
~8 holiday entries carry stale `DTSTART` values from 2017/2018 (the
source reuses old VEVENTs rather than rolling them forward each year),
so they fall outside the standard external-calendar lookahead window
(`EXTERNAL_CALENDAR_WINDOW_MONTHS` / `parseExternalCalendarEvents`'s
one-week-ago-to-N-months-ahead filter in `lib/tag_aggregator.ts`) and
never reach the build. Added as a plain `sources/external/
city-of-snoqualmie.yaml` pointing at `catID=14`, same pattern as
`city-of-north-bend`/`city-of-bothell` — no custom ripper required.
Verified via `ONLY_SOURCE=city-of-snoqualmie npm run generate-calendars`:
3 live events (Snoqualmie Winter Lights, Trunk or Treat at Snoqualmie
Valley YMCA, "Spook"Tacular Halloween in Snoqualmie). Also added
`railroad park & centennial log pavilion` and `snoqualmie valley ymca
parking lot` to `KNOWN_VENUE_COORDS` in `lib/geocoder.ts` (Nominatim
failed on the feed's raw "`<p>Venue</p> - street  City WA zip`"
location strings) so 2 of the 3 events geocode without a network
round-trip; the third event's location field is a long free-text
description rather than a clean address and is left for the geo-resolver
queue.
