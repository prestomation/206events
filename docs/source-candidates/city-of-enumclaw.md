---
name: City of Enumclaw
status: candidate
platform: CivicPlus (CivicEngage) — iCalendar module
url: https://www.cityofenumclaw.net/common/modules/iCalendar/iCalendar.aspx?catID=23&feed=calendar
tags: [Community, Enumclaw]
firstSeen: 2026-09-26
lastChecked: 2026-09-26
pr:
---

City of Enumclaw (King County), same CivicPlus/CivicEngage platform as
`sources/issaquah/`. Category `catID=23` returns 6 clean public events:
"Frosty Friday Evenings" (x2), "Pumpkin Succulent Workshop #1"/"#2", "The
Hungry Housewives 12th Annual Craft and Vendor Show", "Hometown Harvest
2026 Osceola Country Gardens Event". Scanned catIDs 1–60: every other
populated category (26, 29, 42, 43, 45, 50, 53) is committee/board
meetings, and 36 is just office-closure holidays — skip those, same as
Issaquah's implementation skipped council/boards/closures.

Feed URL pattern: `https://www.cityofenumclaw.net/common/modules/iCalendar/iCalendar.aspx?catID=<id>&feed=calendar`.
LOCATION values use the same `<p>Venue</p> - street  City WA zip` format
as Issaquah — reuse/adapt `normalizeLocation` from
`sources/issaquah/ripper.ts`. 🟡 Medium confidence — verified live data
(6 events, lower volume than North Bend/Issaquah but per AGENTS.md
low-volume sources are still valid), needs the same small custom ripper
pattern rather than a built-in type.
