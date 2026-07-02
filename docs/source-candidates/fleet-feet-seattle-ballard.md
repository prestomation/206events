---
name: "Fleet Feet Seattle-Ballard"
status: added
pr: pending
platform: ICS (public Google Calendar)
url: https://www.fleetfeetseattle.com/events
tags: [Running, Ballard]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---

**Fleet Feet Seattle-Ballard** — `https://www.fleetfeetseattle.com/events` — running specialty store at 5404 22nd Ave NW, Ballard hosting a weekly Tuesday evening group run plus periodic shoe-brand demo runs and community nights.

Investigated 2026-07-02:
- Site embeds Google Calendar event links (`google.com/calendar/event?eid=...`); the base64 `eid` decodes to calendar id `c_80092bed54a556bdfeaefa5af3f8bedc6352c1043791a4a3c61873abe889e0e6@group.calendar.google.com`
- Public ICS export confirmed live: `https://calendar.google.com/calendar/ical/c_80092bed54a556bdfeaefa5af3f8bedc6352c1043791a4a3c61873abe889e0e6%40group.calendar.google.com/public/basic.ics`
- X-WR-CALNAME confirms "Fleet Feet Seattle-Ballard Events"; 26 raw VEVENTs including an indefinite weekly `RRULE:FREQ=WEEKLY;BYDAY=TU` "Tuesday Group Run" plus several dated `RECURRENCE-ID` overrides (brand demo runs, a medical-night series) — 14 future events confirmed via `ONLY_SOURCE` build
- Geocoded via Nominatim: 47.6678553, -122.3845817 (OSM node 2995124385)
- Not already covered — no existing Fleet Feet source in `sources/` or `sources/external/`
- **Implemented** as `sources/external/fleet-feet-seattle-ballard.yaml`, `sourceRole: venue`, `cost: free`
- Along the way, found and fixed a pre-existing bug in `parseExternalCalendarEvents` (`lib/tag_aggregator.ts`): RRULE expansion didn't account for `RECURRENCE-ID` override VEVENTs, so both the generic weekly instance and its override (e.g. "Saucony Demo Run") were emitted for the same slot. Fixed by skipping RRULE-expanded occurrences that have a matching override, covered by a new test in `lib/tag_aggregator.test.ts`.
