---
name: "West Seattle Art Walk"
status: candidate
platform: Recurring (WordPress.com site, no events collection/API)
url: https://wsartwalk.org/
tags: [Artwalk, "West Seattle"]
firstSeen: 2026-08-28
lastChecked: 2026-08-28
---

Free, self-guided monthly art walk across West Seattle galleries, shops,
and studios. Found via a "Seattle art walk gallery night calendar" search.

Investigated 2026-08-28:
- Site confirmed as WordPress.com-hosted (`host-header: WordPress.com`),
  200 OK, no bot-block
- Page title confirms the fixed schedule: "West Seattle Art Walk – Every
  Second Thursday | 5-8pm" — no per-event calendar/API, since the "event"
  is one recurring monthly walk, not a list of discrete listings
- Distinct from the already-implemented `rat-city-artwalk` (White
  Center/16th Ave SW, 3rd Thursday) — this is a separate West Seattle
  neighborhood walk with its own fixed day/time

🔥 High confidence: same shape as the existing `rat-city-artwalk.yaml`
recurring entry (fixed "every 2nd Thursday" schedule, self-guided
multi-venue walk, no structured feed needed). Straightforward
`sources/recurring/west-seattle-art-walk.yaml` implementation — confirm
the exact geographic anchor/address for `geo` and a representative
duration (5-8pm = PT3H) before implementing.
