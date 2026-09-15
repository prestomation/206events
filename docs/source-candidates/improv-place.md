---
name: "The Improv Place"
status: added
platform: Luma (Next.js __NEXT_DATA__)
url: https://luma.com/theimprovplace
tags: [Comedy, Arts]
firstSeen: 2026-09-15
lastChecked: 2026-09-15
pr:
---

Seattle 501(c)(3) nonprofit improv theater running recurring jam/workshop
series at rented venues around the city rather than a single fixed address
(theimprovplace.org). Surfaced via a "Seattle improv theater show calendar"
search — its Eventbrite organizer (`45542671623`) advertises only 2 upcoming
listings, but the org's own site links out to a Luma calendar
(`luma.com/theimprovplace`) with a fuller schedule.

Investigated 2026-09-15:
- Luma page is a Next.js app whose `__NEXT_DATA__` script embeds
  `props.pageProps.initialData.data.upcoming.entries` — same shape already
  consumed by the existing `sources/ai_house` ripper (a different
  organizer's Luma calendar).
- Confirmed 6 real upcoming events at investigation time (Oct–Dec 2026):
  alternating "Unite: A BIPOC Improv Jam" (Langston Hughes Performing Arts
  Institute, 104 17th Ave S) and "Improv & Flow: Seattle Center" (Seattle
  Center Armory — Luma obfuscates this series' exact address behind RSVP,
  only exposing city/neighborhood text).
- Unlike AI House (single fixed venue), events here span multiple rented
  spaces, so implemented with ripper-level `geo: null` and a per-event
  `location` string instead of a fixed constant. When Luma's
  `geo_address_info` only has city/neighborhood text (no `full_address`/
  `short_address`), the event is still published with that best-effort
  location and flagged via the Uncertainty system (`location` field)
  rather than guessing a street address.

Implemented as a custom `IRipper` (`sources/improv_place/`). 6 upcoming
events, 0 parse errors verified via `ONLY_SOURCE=improv-place`.
