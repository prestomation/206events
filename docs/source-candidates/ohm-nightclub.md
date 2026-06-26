---
name: "OHM NIGHTCLUB"
status: added
platform: DICE
url: https://dice.fm/venue/ohm-nightclub-6d7m3
tags: [Music, Nightlife, "Pioneer Square"]
firstSeen: 2026-06-26
lastChecked: 2026-06-26
pr: 734
---

Pioneer Square nightclub at 172 S Washington St, Seattle, WA 98104. R&B, Hip Hop, and Afro Beats venue. Open Friday and Saturday nights.

Investigated 2026-06-26:
- DICE venue confirmed at `dice.fm/venue/ohm-nightclub-6d7m3`
- DICE page title: "OHM NIGHTCLUB tickets and events - Seattle, United States of America" (DICE auto-uppercases venue names in page titles)
- venueName: "Ohm Nightclub" (sentence case — tried "OHM NIGHTCLUB", "OHM Nightclub", and "Ohm Nightclub"; all produced 0 events + 1 parse error in CI because DICE blocks GitHub Actions IPs for uncached sources; venueName resolved by out-of-band runner)
- Upcoming events confirmed for July–August 2026: Afrobeats vs Hip Hop (July 26), DSF (August 17)
- Eventbrite organizer `97924751301` also exists but shows 0 upcoming events — DICE is the primary platform
- geo: lat 47.6010022, lng -122.3318723 (172 S Washington St, via Nominatim)
- Implemented as `sources/ohm_nightclub/ripper.yaml` using the built-in `dice` type with `proxy: "outofband"` (rung 2 escalation — DICE blocks GitHub Actions IPs for new uncached sources)
- `defaultDurationHours: 3` (standard nightclub set)
