---
name: "The Cove"
status: added
platform: Squarespace (custom subclass to filter private-booking placeholders)
url: https://www.thecoveseattle.com/all-events
tags: [Music, "South Lake Union"]
firstSeen: 2026-08-20
lastChecked: 2026-08-20
pr:
---

Waterfront wine bar and social hub at 901 Fairview Ave N in South Lake Union.
Hosts live music sessions — jazz trios to vinyl DJ sets — on its pet-friendly
patio.

Investigated 2026-08-20: Squarespace `?format=json` on `/all-events` confirmed
7 upcoming events with future `startDate` values. Three were "Private Event"
placeholder bookings (not open to the public), so the source uses a custom
`SquarespaceRipper` subclass that filters those out, leaving 4 public events.
Fixed venue → ripper-level `geo` set from the Nominatim geocode of the address.
