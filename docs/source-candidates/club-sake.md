---
name: Club Sake
status: added
platform: Custom HTML
url: https://www.clubsake.com/events/list
tags: [Sports, Outdoors]
firstSeen: 2026-08-14
lastChecked: 2026-09-01
pr:
---

Seattle SAKE Paddling Club — dragon boat, outrigger canoe (OC6), and
stand-up paddleboard sports club.

**Checked 2026-08-14:** The candidate's original name/description was
wrong (imported as a nightclub) — this is **Seattle SAKE Paddling
Club**, not a nightclub. Confirmed live events calendar on the
**revolutioniseSPORT** platform (admin portal at
`portal.revolutionise.com.au/sake`), with real dated/timed events:
Recreational Crew Dragon Boat (Sat Aug 15, 8-9am), Dragon Boat Training
(Sat Aug 15, 9-11am), OC6 General Session (Sun Aug 16, 11am-1pm), SUP
Session (Wed Aug 19, 6:30-8:30pm). Multiple weekly sessions — decent
volume. revolutioniseSPORT sites sometimes expose a JSON/ICS export;
worth checking their admin/API docs if implemented.

**Implemented 2026-09-01:** The public `clubsake.com/events/list` page
(a Laravel-backed marketing site in front of the revolutioniseSPORT
member portal, not the portal itself) turned out to be fully
server-rendered HTML with structured event cards — no login or JS
required, no need for the gated `portal.revolutionise.com.au` admin
API. Implemented a custom `IRipper` (`sources/club_sake/ripper.ts`)
that paginates `?page=N` until an empty page, parsing each
`.card.card-hover` for title, date/time range (including a rarer
multi-day "Sat ... - Sun ..." format used by away regattas), location,
and category badge. Filters out manually-flagged cancellations
("CANCELED - ..." titles). Verified live via
`ONLY_SOURCE=club-sake npm run generate-calendars`: 77 events, 0 parse
errors, mostly at two in-city venues (Leschi South Sailboat Moorage,
Lakewood Marina) with a handful of away races (Tacoma, Portland).
Added a `KNOWN_VENUE_COORDS` entry for "Leschi South Sailboat Moorage"
in `lib/geocoder.ts` (OSM way 52135058, "Leschi South Marina") since
the bare venue name on its own doesn't resolve via Nominatim.
