---
name: "Picklewood Paddle Club"
status: investigating
platform: unknown (booking portal separate from marketing site)
url: https://www.picklewood.net/
tags: [Sports, SoDo]
firstSeen: 2026-09-06
lastChecked: 2026-09-06
---
**Picklewood Paddle Club** — `https://www.picklewood.net/` — 4121 1st Ave S,
Seattle, WA 98134 (SoDo). New 25,000 sq ft pickleball club (7 indoor + 4
outdoor courts) with a restaurant/bar by chef Ethan Stowell, opened
Nov 21, 2025 / grand opening Dec 5, 2025. Runs leagues (e.g. Summer
League), classes, tournaments (Gopher Cup), and themed nights (Pride
Night).

Investigated 2026-09-06:
- Marketing site (`picklewood.net`) has no dedicated events/calendar page —
  program info (Leagues/Classes/Open Play) links out to a separate booking
  portal at `play.picklewood.net`
- No CMS/platform fingerprint found on the marketing site (no Squarespace,
  Wix, or WordPress markers detected)
- `play.picklewood.net` is a court-booking/reservation system, not
  necessarily a public events feed — needs direct inspection (network
  trace) to see if it's a known platform (CourtReserve, PlayByPoint, etc.)
  with an API, or if league/tournament dates are only announced via their
  newsletter (`picklewood.beehiiv.com`) and Facebook page
- Not yet confirmed viable — needs a follow-up pass inspecting
  `play.picklewood.net` directly

**Next step**: inspect `play.picklewood.net` for a public schedule/API: if it's a
recognized booking platform, check whether league nights/tournaments (as
opposed to private court reservations) are exposed as public events.
