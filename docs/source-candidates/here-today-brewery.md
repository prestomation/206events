---
name: "Here Today Brewery + Kitchen"
status: added
platform: ICS (Google Calendar)
url: https://www.heretodayseattle.com/event-calendar
tags: [Beer, Belltown]
firstSeen: 2026-09-01
lastChecked: 2026-09-01
pr: 1331
---

Seattle waterfront brewery and kitchen at 2815 Elliott Ave, Suite 101,
Belltown (opened 2022, founded by Chris Elford). Hosts recurring weekly
programming: trivia, bingo, and a run club.

Investigated 2026-09-01: `/event-calendar` is a plain Squarespace page
(`?format=json` → `typeName: "page"`, `itemCount: 0` — not a real events
collection), but the page embeds a public **Google Calendar** iframe
(`c_68b145f3cfd346b343edd8b12a218719cd5be6bc17312d7bda694f602026d335@group.calendar.google.com`).
Its public ICS export
(`https://calendar.google.com/calendar/ical/c_68b145f3.../public/basic.ics`)
returns a valid `VCALENDAR` with 75 `VEVENT`s, including several
open-ended weekly `RRULE:FREQ=WEEKLY` recurrences with no `UNTIL` (or a
future one): "Head in the Clouds Trivia" (Mondays), "Kirby's Bingo
Kingdom" (weekly), "Run Club!" (weekly) — `ical.js` (used by the build
for external ICS feeds) expands these into ongoing future occurrences.
Single fixed venue — `geo` resolved via Nominatim (`amenity=pub`
`Here Today Brewery & Kitchen`, OSM node 11013224482,
47.6149875/-122.353981, high-confidence direct name match).

Implemented as `sources/external/here-today-brewery.yaml` (`sourceRole:
venue`, `geo` set, `Beer`/`Belltown` tags). PR #1331.
