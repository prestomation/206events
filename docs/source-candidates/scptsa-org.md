---
name: Seattle Public Schools Board of Directors Regular Meeting
status: added
platform: Squarespace
url: https://scptsa.org/upcoming-events
tags: ["Community", "Political"]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
pr: 1493
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: scptsa.org.

Sample event: "Seattle Public Schools Board of Directors Regular Meeting" (2026-08-26T23:30:00.000Z)
Description: Regular School Board Meeting held at the John Stanford Center for Educational Excellence. Members of the public are welcome to attend in person. Public testimony is taken in person and by teleconferen

**Implemented 2026-09-15:** the `scptsa.org` domain is Seattle Council
PTSA (a nonprofit representing 80+ Seattle Public Schools PTAs/PTSAs, not
a religious org), which turns out to be a full Squarespace events
collection, not a one-off page — confirmed via
`upcoming-events?format=json` (`collection.typeName: "events"`,
`itemCount: 119`, 45 upcoming). Content spans SCPTSA's own board/general
meetings, SPS Board of Directors meetings, and partner-org listings
(WAISN trainings, Seattle Education Association hiring sessions,
legislative-session milestones) — all civic/advocacy events serving the
Seattle Public Schools community. Implemented with the built-in
`squarespace` ripper type (`sources/seattle_council_ptsa/`),
`sourceRole: venue` (matching the precedent of similar single-org
community-calendar sources like `west_seattle_indivisible` and
`beacon_hill_council`), `geo: null` for per-event geocoding. Added
`john stanford center for educational excellence` to
`KNOWN_VENUE_COORDS` in `lib/geocoder.ts` (coords taken from the
source's own embedded `mapLat`/`mapLng`, no reverse-geocoding) since it
recurs across many SPS board meeting entries and Nominatim couldn't
resolve the "3rd Avenue" vs. actual "3rd Ave S" address. 45 upcoming
events, 0 parse errors, 1 non-fatal Uncertainty (missing duration) and 2
non-fatal geocode gaps (an out-of-Seattle Olympia legislative-session
marker) left for the geo-resolver queue, verified via
`ONLY_SOURCE=seattle-council-ptsa`.
