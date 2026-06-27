---
name: "Seattle Chamber Music Society"
status: added
platform: Custom (WordPress Elementor with embedded JSON)
url: https://www.seattlechambermusic.org/events/
tags: [Music, Arts]
firstSeen: 2026-05-07
lastChecked: 2026-06-27
---
Seattle Chamber Music Society presents its annual Summer Festival with free outdoor Concert Truck performances at Seattle parks plus ticketed concerts at Nordstrom Recital Hall at Benaroya Hall. Also offers lectures, open rehearsals, and community events at their Center for Chamber Music (601 Union St, Seattle).

Investigated 2026-06-19:
- Events listing at `/events/` with pagination (pages 1-4, ~12 events per page)
- Embedded JSON per page provides all events: `{"calendars":[{"entries":[{"title":"...","id":"...","date":"MM/DD/YYYY","category":"..."},...]}]}`
- HTML cards on each page provide: event time, event URL, title (via `event_item_info_date_time`, `event_item_link`, `h4` elements)
- 43 entries total in JSON; 2 online lectures excluded; 1 empty `{}` entry skipped; 40 events published
- Location inferred from title patterns: Concert Truck (extract venue after "–"), In-Person / lectures → Center for Chamber Music, Summer Festival Concerts → Nordstrom Recital Hall at Benaroya Hall, Volunteer Park events
- Implemented as `sources/seattle_chamber_music/` with custom IRipper, 40 events confirmed

Updated 2026-06-27:
- Added Concert Truck schedule page (`/concert-truck/`) as authoritative source for Concert Truck events
- Main events JSON can carry wrong dates for some events (e.g., July 5 shows as July 4); the schedule page is correct
- Schedule page lists all tour stops with date/time/venue in structured icon-list HTML: "Day. Month Date | Time | Venue"
- 24 Concert Truck events + 18 Summer Festival/other events = 42 events total
- Ripper now skips Concert Truck entries from main JSON when schedule page has events (fall-through if page unavailable)
