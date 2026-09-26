---
name: City of Snoqualmie
status: investigating
platform: CivicPlus (CivicEngage) — iCalendar module
url: https://www.snoqualmiewa.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar
tags: [Community, Snoqualmie]
firstSeen: 2026-09-26
lastChecked: 2026-09-26
pr:
---

City of Snoqualmie (King County), same CivicPlus platform as Issaquah/
North Bend/Enumclaw. `catID=14` ("Community Events") mixes ~6 genuine
public events ("Snoqualmie Winter Lights", "Trunk or Treat at Snoqualmie
Valley YMCA", "\"Spook\"Tacular Halloween in Snoqualmie", "Mount Si High
School Jazz Ensemble I Day", "Holiday Tree Pick-Up by Local Boy Scout
Troops") with ~8 generic city-office-closure holiday entries (New Year's
Day, MLK Day, Memorial Day, Independence Day, Labor Day, Columbus Day,
Veterans Day, Thanksgiving, Christmas) that are not real public events
and would need to be filtered out by title pattern in a custom ripper.
`catID=62` has a single event ("Ice Cream & Cookies with Mayor Mayhew").
`catID=30` is committee meetings (skip, as with the other CivicPlus
cities).

Investigating rather than a plain `candidate` because it needs
title-based filtering logic beyond the Issaquah/North Bend/Enumclaw
pattern (those only needed to skip whole categories, not filter within
one). Worth a look next cycle for a title-exclusion list
(`/^.* - City Offices Closed$/`, plain federal-holiday names with no
other text) on top of the shared `normalizeLocation` reuse.
