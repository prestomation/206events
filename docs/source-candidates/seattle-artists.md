---
name: "SeattleArtists.com"
status: notviable
platform: Custom (Next.js)
url: https://www.seattleartists.com/calendar
tags: []
firstSeen: 2026-07-12
lastChecked: 2026-09-01
---
Local art-events directory/calendar site referencing an "Art Calendar" page
aggregating gallery and studio events citywide.

Investigated 2026-07-12:
- `/calendar` page returns HTTP 200 but is a client-rendered Next.js app —
  no event data, JSON-LD, or calendar-platform hints (Squarespace/WordPress/
  Tribe) present in the static HTML
- No ICS feed, API, or structured event markup found
- Not viable without JS rendering support the pipeline doesn't have; would
  need to re-investigate if the site adds a public feed

Re-checked 2026-09-01: the `/calendar` page is still a client-rendered SPA
with no data in the static HTML, but it turns out to call a real JSON API
at `https://www.seattleartists.com/api/events` that returns clean
structured data (`title`, `description`, ISO `startDate`/`endDate`,
`registrationUrl`, `imageUrl`, `venueId`, `cost`) — this would be a
trivial `JSONRipper` implementation on data quality alone.

However, the venue geography is **Puget Sound-wide, not Seattle-focused**:
of the 46 API entries (5 with future dates at check time), sampled events
include Gallery North (Edmonds), Parklane Gallery (Kirkland), a Vashon
Island studio tour, a Renton studio tour, Maple Valley Days Arts
Festival, and BIMA (Bainbridge Island Museum of Art) programming —
alongside genuinely Seattle venues (Ballard, Freehold Theatre, Native
Action Network). Roughly half of the sampled events are outside Seattle
city limits, which independently fails the source-discovery
Seattle-focused quality gate. Remains `notviable` — now for two
independent reasons (no reachable data as of July, and non-Seattle
geography as of September) rather than one. Worth a second look only if
the org narrows scope to Seattle-only venues.
