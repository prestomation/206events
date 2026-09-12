---
name: The Angry Beaver
status: added
platform: SpotHopper (JSON API)
url: https://theangrybeaverseattle.com/events
tags: ["Nightlife", "Greenwood"]
firstSeen: 2026-08-25
lastChecked: 2026-09-12
pr: 1455
---

Neighborhood bar at 8412 Greenwood Ave N, Seattle (Greenwood), running
its event promos through **SpotHopper**, a restaurant/bar marketing
platform (`static.spotapps.co` widget assets).

Discovered 2026-08-25 via aggregator gap analysis (1 sample event,
"National Whiskey Sour Day").

**Implemented 2026-09-12:** Identified the underlying platform from the
`static.spotapps.co/web/theangrybeaverseattle--com/...` widget script and
found SpotHopper's public JSON API requires no auth:
`https://www.spothopperapp.com/api/spots/67355/events`. Confirmed 5
real upcoming events (National Cheeseburger Day, National Drink Beer
Day, National Taco Day, National Pasta Day, Halloween) with structured
`event_date` + local `start_time` + `duration_minutes` fields — clean
enough to implement as a straightforward custom `JSONRipper`
(`sources/angry_beaver_seattle/`). Address/coordinates confirmed via
Nominatim (OSM node 2131146507).

Note for future cycles: several other candidates run the same
SpotHopper platform (Baba Yaga — 2 upcoming events at
`spots/275781/events`; Stone Way Cafe, Bathtub Gin Seattle, Sully's
Queen Anne currently 0 upcoming at their spot ids) — worth revisiting
as a generic built-in ripper type if a third SpotHopper venue with
real volume turns up.
