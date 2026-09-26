---
name: City of North Bend
status: candidate
platform: CivicPlus (CivicEngage) — iCalendar module
url: https://www.northbendwa.gov/common/modules/iCalendar/iCalendar.aspx?catID=21&feed=calendar
tags: [Community, "North Bend"]
firstSeen: 2026-09-26
lastChecked: 2026-09-26
pr:
---

City of North Bend (King County), same CivicPlus/CivicEngage platform as
`sources/issaquah/` (which already has a working custom ripper for this
exact pattern). Category `catID=21` ("Community Events") returns 11 clean
public events with no committee-meeting noise: "What's Brewing North
Bend" (x3), "Arbor Day and Oaktoberfest", "Free Yard Waste Recycling
Event", "North Bend Trail Fest", "North Bend Blues Walk", "'Merica 250
Downtown Foundation Disc Golf Tournament Fundraiser", "An Evening with
Snoqualmie Valley Museum Silent Auction", etc.

Feed URL pattern: `https://www.northbendwa.gov/common/modules/iCalendar/iCalendar.aspx?catID=<id>&feed=calendar`
(scanned catIDs 1–60; only 21 returned non-meeting content). LOCATION
values follow the same `<p>Venue</p> - street  City WA zip` HTML-embedded
format as Issaquah's feed, so this needs the same location-normalizing
custom ripper (`normalizeLocation` from `sources/issaquah/ripper.ts` is
directly reusable/adaptable) rather than a plain `sources/external/`
entry. 🟡 Medium-high confidence — verified live data, but needs a small
custom ripper (same shape as Issaquah's), not a built-in type.
