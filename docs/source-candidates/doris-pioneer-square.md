---
name: "Doris"
status: notviable
platform: Wix
url: https://www.doris.live/
tags: [Nightlife, "Pioneer Square"]
firstSeen: 2026-09-12
lastChecked: 2026-09-12
---

Small (20-seat) cocktail bar/restaurant at 309 3rd Ave S, Pioneer Square,
from Rally Hospitality (opened 2026, replacing Salumi). Reservation-only,
closed weekends, no ticketed programming.

Investigated 2026-09-12:
- Site is Wix (thunderbolt renderer), not Squarespace/WordPress — no
  built-in ripper type and no public JSON events endpoint.
- The only events-adjacent page, `/events-groups`, is a private
  group-booking inquiry form (client-side rendered, no dated listings) —
  not a public calendar.
- This is a small reservation-based bar, not an event venue; no evidence of
  a recurring programmed schedule to model as `sources/recurring/`.
- Not viable — no public, structured, dated event data exists.
