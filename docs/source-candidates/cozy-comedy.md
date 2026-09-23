---
name: "Cozy Comedy"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/cozy-comedy-44931221223
tags: [Comedy]
firstSeen: 2026-09-23
lastChecked: 2026-09-23
pr: 1576
---

Independent standup comedy production company based in Seattle (owned and
operated by comedians Travis Sherer and Marcus Moreno), producing 130+ shows
a year around the Pacific Northwest in backyards, bars, restaurants,
breweries, and theaters.

Investigated 2026-09-23:
- Confirmed real Eventbrite organizer `44931221223` (`eventbrite.com/o/cozy-comedy-44931221223`,
  bio confirms Seattle-based PNW touring producer)
- Public `https://www.eventbrite.com/api/v3/organizers/44931221223/events/?status=live`
  returns `object_count: 14` at time of check — venues include the Grange,
  Sound Hotel (Seattle), Edmonds Theater, North Bend, and others across the
  region
- Itinerant multi-venue producer (own shows, not republishing other orgs')
  — same pattern as `sources/mockingbird_comedy/ripper.yaml`: `geo: null`,
  `sourceRole: venue`, per-event location comes from the Eventbrite `venue`
  field
- Not already covered elsewhere in `sources/` or `sources/external/`
