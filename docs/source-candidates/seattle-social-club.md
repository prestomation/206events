---
name: "Seattle Social Club"
status: candidate
platform: Eventbrite
url: https://www.eventbrite.com/o/seattle-social-club-42795102333
tags: [Community]
firstSeen: 2026-07-04
lastChecked: 2026-07-04
pr:
---

Social meetup organizer for single millennials / people looking to make
friends in Seattle — runs recurring social mixers, board game nights, and
group activities around the city (not tied to one venue).

Investigated 2026-07-04:
- Eventbrite organizer id `42795102333`, verified via the public
  `eventbrite.com/api/v3/organizers/42795102333/events/?status=live`
  endpoint: **2 live upcoming events** — "Pitch a Friend: Seattle (Ages
  21-40)" (Jul 17, 2026) and "Board Game Night at Old Stove Gardens" (Jul
  14, 2026, at Old Stove Gardens, Pike Place Market).
- 🔥 High confidence — built-in `eventbrite` ripper type, confirmed working
  organizerId with real dated events. Would need a `defaultLocation`
  fallback since events move between venues (itinerant, `geo: null` at
  ripper level).
- Not currently covered elsewhere in `sources/` or `sources/external/`.
