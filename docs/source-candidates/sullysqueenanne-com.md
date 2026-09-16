---
name: "Sully's Queen Anne"
status: added
platform: SpotHopper (JSON API)
url: https://sullysqueenanne.com/seattle-queen-anne-sully-s-events
tags: ["Nightlife", "QueenAnne"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr: TBD
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: sullysqueenanne.com.

Sample event: "National Whiskey Sour Day" (2026-08-25T18:00:00.000Z)
Description: National Whiskey Sour Day! Come down and let our awesome bartenders make you a great Whiskey Sour!

**Investigated 2026-09-16:** the events page (`/seattle-queen-anne-sully-s-events`)
is server-rendered HTML with a stable per-event structure
(`data-event-id` on each `<section>`), same "SpotOn"/`spotapps.co` bar
website platform as `sources/angry_beaver_seattle`. Found a public
JSON API behind it, same shape as Angry Beaver's SpotHopper feed:
`https://www.spothopperapp.com/api/spots/78398/events` (spot id lifted
from the site's own "Jobs" link `?spot_id=78398`). Confirmed live:
4 upcoming events (National Cheeseburger Day, National Drink Beer Day,
National Taco Day, Halloween), no auth required. Venue address
(1625 Queen Anne Ave N, Seattle, WA 98109 — "Sully's Lounge" in OSM)
confirmed via the site's homepage `LocalBusiness` JSON-LD.

**Implemented** as `sources/sullys_queen_anne` (custom `JSONRipper`,
modeled directly on `angry_beaver_seattle`'s SpotHopper parser, with a
proper `linked.images` join for per-event photos — the live API returns
image ids referencing a top-level `linked.images` collection rather than
inline image objects).
