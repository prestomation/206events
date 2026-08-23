---
name: "Innervisions Posters & Framing (Open Mic Night)"
status: candidate
platform: Eventbrite
url: https://www.eventbrite.com/o/seattle-records-49577348033
tags: [Music, University District]
firstSeen: 2026-08-07
lastChecked: 2026-08-23
---

Poster/record shop at 4548 University Way NE, University District, hosting a
free monthly "Open Mic Night" (hip hop, poetry, comedy, singer-songwriters)
on the first Friday of each month, 7-9 PM sign-up. Donation based; ~40+ years
running per local coverage. Also has an art-walk presence.

Ticketing/listing organizer on Eventbrite is **"Seattle Records"**
(`organizerId: 49577348033`, `numEvents: 32` on the organizer record — a
real, active organizer, not a one-off).

Investigated 2026-08-07:
- Public Eventbrite v3 API check (`eventbrite.com/api/v3/organizers/49577348033/events/?status=live`)
  returned `"object_count":0` — **no live events at time of check**. The
  monthly listing is apparently created shortly before each occurrence
  rather than kept perpetually live.
- Per the "never merge a source with 0 events" rule, do not implement yet.

Re-check closer to a First Friday (next listing likely posts a few weeks out)
to confirm a live event appears under this organizer ID before implementing
as `eventbrite` type.

Re-checked 2026-08-23: organizer `49577348033` public API
(`/api/v3/organizers/49577348033/events/?status=live`) still returns
`object_count: 0`. No change.
