---
name: City of North Bend
status: added
platform: CivicPlus (CivicEngage) — iCalendar module
url: https://www.northbendwa.gov/common/modules/iCalendar/iCalendar.aspx?catID=21&feed=calendar
tags: [Community, "North Bend"]
firstSeen: 2026-09-26
lastChecked: 2026-09-27
pr: 1608
---

City of North Bend (King County), same CivicPlus/CivicEngage platform as
`sources/issaquah/`. Category `catID=21` ("Community Events") returns
clean public events with no committee-meeting noise: "What's Brewing
North Bend" (x3), "Arbor Day and Oaktoberfest", "Free Yard Waste
Recycling Event", "North Bend Trail Fest", "North Bend Blues Walk",
"'Merica 250 Downtown Foundation Disc Golf Tournament Fundraiser", "An
Evening with Snoqualmie Valley Museum Silent Auction", etc.

Feed URL pattern: `https://www.northbendwa.gov/common/modules/iCalendar/iCalendar.aspx?catID=<id>&feed=calendar`
(scanned catIDs 1–60; only 21 returned non-meeting content).

Implemented 2026-09-27 as a plain `sources/external/city-of-north-bend.yaml`
ICS entry (`sourceRole: aggregator`, `geo: null`) — following the
City of Bothell / City of Duvall / City of Redmond precedent of accepting
the feed's raw `<p>Venue</p> - street  City WA zip` LOCATION strings as-is
rather than building a custom ripper like Issaquah's. `ONLY_SOURCE=city-of-north-bend
npm run generate-calendars` confirmed **10 events, 0 parse errors**.
Several locations returned `GeocodeError` (Nominatim can't parse the
HTML-embedded venue strings) — same as Bothell/Duvall, left for the
geo-resolver skill to backfill into `KNOWN_VENUE_COORDS` over time.
