---
name: "Seattle Dance Info"
status: added
platform: WordPress / Tribe Events ICS
url: https://seattledanceinfo.com/calendar/
tags: [Dance]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
pr: pending
---
SeattleDanceInfo — community calendar for social dancing events in the Seattle area. Covers swing, tango, ballroom, blues, and more.

Investigated 2026-06-30:
- WordPress site with Tribe Events plugin
- `?post_type=tribe_events&ical=1&eventDisplay=list` returns valid VCALENDAR (30 upcoming events)
- Events include: tango milongas, swing dances, blues dances, ballroom socials, and dance classes
- Venues: Reverie Ballroom (Capitol Hill), Phinney Center, Eagles Mother Aerie (Lake City), Sunset Hill Community Club, OmCulture, and others
- Accessible without proxy (HTTP 200 from remote environment)
- Multi-venue aggregator; geo: null, sourceRole: aggregator
- Distinct from `seattledances.com` (professional performances) and `go-latin-dance-seattle` (Latin dance only)
- Implemented as `sources/external/seattle-dance-info.yaml`
- Tags: Dance
