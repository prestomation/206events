---
name: "Seattle Chamber Music Society"
status: added
platform: Custom (WordPress Elementor with embedded JSON)
url: https://www.seattlechambermusic.org/events/
tags: [Music, Arts]
firstSeen: 2026-05-07
lastChecked: 2026-06-19
---
Seattle Chamber Music Society presents its annual Summer Festival with free outdoor Concert Truck performances at Seattle parks plus ticketed concerts at Nordstrom Recital Hall at Benaroya Hall. Also offers lectures, open rehearsals, and community events at their Center for Chamber Music (601 Union St, Seattle).

Investigated 2026-06-19:
- Events listing at `/events/` with pagination (pages 1-4, ~12 events per page)
- Embedded JSON per page provides all events: `{"calendars":[{"entries":[{"title":"...","id":"...","date":"MM/DD/YYYY","category":"..."},...]}]}`
- HTML cards on each page provide: event time, event URL, title (via `event_item_info_date_time`, `event_item_link`, `h4` elements)
- 43 entries total in JSON; 2 online lectures excluded; 1 empty `{}` entry skipped; 40 events published
- Location inferred from title patterns: Concert Truck (extract venue after "–"), In-Person / lectures → Center for Chamber Music, Summer Festival Concerts → Nordstrom Recital Hall at Benaroya Hall, Volunteer Park events
- Implemented as `sources/seattle_chamber_music/` with custom IRipper, 40 events confirmed
