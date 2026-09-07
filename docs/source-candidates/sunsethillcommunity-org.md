---
name: Sunset Hill Community Hall
status: added
platform: ICS (WordPress The Events Calendar)
url: https://sunsethillcommunity.org/events/?ical=1
tags: [Ballard, Community]
firstSeen: 2026-08-25
lastChecked: 2026-09-07
pr:
---

Rented community hall at 3003 NW 66th Street, Ballard. `?ical=1` export
(WordPress "The Events Calendar" plugin) returns a valid VCALENDAR with
~30 future VEVENTs: drop-in dance classes (Waltz Etc., Cross-step
Waltz), Bell Frame Yoga, Creative Pre-Ballet/Ballet classes, comedy
improv, watercolor painting, an open mic, choir rehearsal, plus a
handful of private-rental placeholders ("Private Event", board
meeting, Girl Scout troop meeting) mixed in from the venue's rental
calendar.

Added as `sources/external/sunset-hill-community-hall.yaml`
(`sourceRole: venue`, `geo` resolved to OSM way 217236517). Verified
locally: `ONLY_SOURCE=sunset-hill-community-hall npm run
generate-calendars` → 30 events, 0 errors, 0 geocode errors (most
events carry their own `LOCATION` text and geocode independently of
the declared venue `geo`).
