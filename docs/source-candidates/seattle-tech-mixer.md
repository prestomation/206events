---
name: "Seattle Tech Mixer"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/tech-seattle-68154040953
tags: ["Tech", "South Lake Union"]
firstSeen: 2026-07-29
lastChecked: 2026-07-29
pr:
---

Recurring Seattle tech networking mixer series organized by "tech Seattle"
("a product design studio and incubator building community-based
businesses in public", founded Dec 2022). Consistently held at Tapster,
1011 Valley Street, South Lake Union.

Investigated 2026-07-29:
- Confirmed Eventbrite organizer (id `68154040953`) via the public
  `eventbriteapi.com/v3/organizers/<id>/events/?status=live` endpoint —
  1 live event: "Seattle Tech Mixer 2026", July 30 2026 6-9pm, at Tapster
  (venue_id `298320669`, lat/lng `47.6255812,-122.3366232`, matches
  OSM node `9009011574`).
- Web search confirms a recurring monthly-ish cadence with a multi-year
  track record (instances found Jan/Mar/Jun/Aug 2025, Jun/Jul 2026).
- Built-in `eventbrite` ripper type — `EVENTBRITE_TOKEN` is already a
  configured repo secret (used by other existing Eventbrite sources), so
  no new credential setup needed.
- Not already covered: distinct from `sources/new_tech_seattle/` (a
  different Meetup-based tech meetup at The Collective Seattle, run by a
  different organizer).

Implemented: `sources/seattle_tech_mixer/ripper.yaml` — 1 confirmed live
event via the public API at time of check; CI (with `EVENTBRITE_TOKEN`)
will confirm via the private API.
