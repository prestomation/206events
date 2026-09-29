---
name: "VUE Seattle"
status: candidate
platform: Eventbrite
url: https://www.vueseattle.com/
tags: [Nightlife, Belltown]
firstSeen: 2026-09-29
lastChecked: 2026-09-29
---

**VUE Seattle** (aka Vue Lounge) — 2326 2nd Ave, Belltown — nightclub/lounge
with DJ-driven EDM/hip-hop/Latin nights, themed parties, and bottle service.
Open Thu–Sat.

Investigated 2026-09-29:
- Has an Eventbrite organizer profile: `https://www.eventbrite.com/o/vue-seattle-23204404721`
  (organizer id `23204404721`)
- The organizer page itself is a client-rendered Next.js app (no event data
  in the static HTML), so listing count couldn't be confirmed by a plain
  fetch. This repo's built-in `eventbrite` ripper type reads the
  `eventbriteapi.com` REST API directly (not the HTML page) via
  `EVENTBRITE_TOKEN`, which this session doesn't have — so the organizer id
  is unverified against live data.
- 🟡 Medium confidence: built-in `eventbrite` type, plausible but unverified
  org id. Next cycle: confirm via `GET
  https://www.eventbriteapi.com/v3/organizers/23204404721/events/?status=live`
  with `EVENTBRITE_TOKEN` before implementing (per source-discovery
  skill step 6, confidence tiers).
