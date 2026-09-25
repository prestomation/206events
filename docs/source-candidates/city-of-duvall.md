---
name: City of Duvall
status: added
platform: CivicPlus (common/modules/iCalendar, same platform as city-of-bothell / city-of-redmond-community-events)
url: https://www.duvallwa.gov/calendar.aspx
tags: [Community, Duvall]
firstSeen: 2026-09-25
lastChecked: 2026-09-25
pr: 1598
---

City of Duvall community calendar (King County, Sammamish Valley). Confirmed
CivicPlus (`common/modules/iCalendar/iCalendar.aspx`), same platform family as
`city-of-bothell` and `city-of-redmond-community-events`.

Investigated 2026-09-25:
- The default calendar view redirects to a mobile template (`/m/calendar`)
  that lists categories via checkboxes rather than a `CID=` query param.
  Category `14` is "Home Page Calendar" — the site's combined default view,
  covering city holiday closures, City Council/committee meetings, the
  Cultural Commission, and recurring "Mayor Meetup" coffee chats at local
  cafes (Rustic Cabin, Grateful Bread, CC's Espresso & Ice Creamery) plus
  one-off community events (SnoValley Flood Forum). A dedicated "Music,
  Arts, & Festivals" category (22) exists but currently has 0 events.
- `common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar` returns a
  valid VCALENDAR; the build's lookahead window yields 21 upcoming events at
  time of check.
- Not already covered elsewhere in `sources/` or `sources/external/`.
- 7 non-fatal geocode errors from source-embedded HTML markup in some
  `LOCATION` fields (e.g. `<p>Rustic Cabin</p> - 15715 Main St NE #105 Duvall
  WA 98019`) — left for the geo-resolver queue, same pattern as
  `city-of-bothell`.
- Implemented as `sources/external/city-of-duvall.yaml`.
