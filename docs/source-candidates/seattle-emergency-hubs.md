---
name: "Seattle Emergency Hubs"
status: added
platform: ICS (WordPress / Tribe Events)
url: https://seattleemergencyhubs.org/
tags: [Community, Volunteer]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
pr: 779
---
**Seattle Emergency Hubs** — `https://seattleemergencyhubs.org/` — volunteer-run neighborhood
disaster-preparedness network. Hub groups across Seattle neighborhoods (Ballard, Beacon Hill,
Mount Baker, West Seattle, Madison Park, Haller Lake, Rainier Beach, and more) run drills,
volunteer trainings, radio net check-ins, and outreach tables at community events.

Investigated 2026-06-30:
- WordPress site running The Events Calendar (Tribe Events) plugin
- Standard Tribe ICS export confirmed working: `https://seattleemergencyhubs.org/calendar/list/?ical=1`
  (note: `/events/?ical=1` 404s — the calendar lives at `/calendar/`, not `/events/`)
- 30 confirmed upcoming events as of 2026-06-30, spanning multiple Seattle neighborhoods
- `geo: null` (multi-location org, no single fixed address)
- `sourceRole: venue` (first-party feed for the org's own programming, multi-branch like `spl`)
- `cost: free`
- Some event locations (park names without exact geocoder-friendly addresses, "Online via Zoom")
  produced geocode errors — non-fatal, left for the geo-resolver skill to backfill
  `KNOWN_VENUE_COORDS` entries in a future cycle.

Implemented as `sources/external/seattle-emergency-hubs.yaml`.
