---
name: Baba Yaga
status: added
platform: SpotHopper (JSON API)
url: https://babayagaseattle.com/seattle-baba-yaga-events-days
tags: ["Music", "Nightlife", "Pioneer Square"]
firstSeen: 2026-08-25
lastChecked: 2026-09-17
pr: 1522
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: babayagaseattle.com.

Sample event: "HOMETOWN FM Artist Showcase" (2026-08-25T03:00:00.000Z)
Description: Artist showcase at Baba Yaga.

**Investigated/implemented 2026-09-17:** already partially covered as a
non-dedicated calendar inside `sources/seattle_showlists` (VENUE_CONFIG
entry, `Pioneer Square` tag only). Re-investigated as its own source per
AGENTS.md "Prefer venue websites over showlists."

- Confirmed the venue runs its event promos through **SpotHopper**, the
  same restaurant/bar marketing platform already integrated for
  `sources/angry_beaver_seattle`, `sources/sullys_queen_anne`, and
  `sources/bad_alberts`.
- Spot id `275781` found via the `spothopperapp.com/api/spots/275781/...`
  URL embedded in the site's own "texting permission" contact link.
- Public JSON API confirmed live and unauthenticated:
  `https://www.spothopperapp.com/api/spots/275781/events` — 2 upcoming
  events at time of check (National Coffee Day 9/29, National Taco Day
  10/6), both `has_tickets: false` (free, no cover).
- Venue address/geo matches the existing showlists entry exactly
  (124 S Washington St, Seattle, WA 98104; OSM node 2351695513;
  47.601053, -122.333163) — reused directly, no new geocode needed.
- SpotHopper's own `spot_category_name` for this venue is "Music Venue"
  (self-description: "Seattle's morning, noon, and night rock and roll
  clubhouse"), justifying the `Music` tag alongside `Nightlife` and the
  existing `Pioneer Square` neighborhood tag.

**Implemented** as `sources/baba_yaga` (custom `JSONRipper`), copied
directly from the proven `sullys_queen_anne` SpotHopper parser pattern
(same event shape: `event_date` + `start_time` + `duration_minutes`,
`linked.images` join for photos, `UncertaintyError` on a missing
`start_time`). `sourceRole: venue`, `cost: free`. Marked `skip: true` on
the `Baba Yaga` entry in `sources/seattle_showlists/ripper.ts`
`VENUE_CONFIG`, removed its calendar entry from
`sources/seattle_showlists/ripper.yaml`, and added
`allowed-removals/seattle-showlists-baba-yaga.ics` for the removed
`seattle-showlists-baba-yaga.ics` URL. Verified 2 events / 0 errors via
`ONLY_SOURCE=baba-yaga npm run generate-calendars`.
