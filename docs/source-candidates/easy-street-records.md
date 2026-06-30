---
name: "Easy Street Records"
status: investigating
platform: DICE
url: https://easystreetonline.com/events
tags: [Music, "West Seattle"]
firstSeen: 2026-06-25
lastChecked: 2026-06-30
---

Legendary West Seattle record store and café at 4559 California Ave SW (Alaska Junction). Hosts in-store performances, album release parties, live music events. One of the most celebrated independent record stores in the US, with events listed on DICE.

Investigated 2026-06-25:
- DICE venue confirmed at `dice.fm/venue/easy-street-records-lg5w`
- DICE API (`events-api.dice.fm`) is accessible from GitHub Actions CI (same as all other DICE sources: Kremwerk, Belltown Yacht Club, Vera Project, Black Lodge, Sunset Tavern)
- DICE API and dice.fm are blocked from the remote execution environment; venueName cannot be verified locally
- Venue name derived from DICE URL slug: `easy-street-records-lg5w` → "Easy Street Records"
- CI trial on 2026-06-25 (`sources/easy_street_records/ripper.yaml`, venueName: "Easy Street Records") returned 0 events + 1 parse error from the DICE API
- The parse error was likely a 429 rate-limit (OHM NIGHTCLUB CI also ran on 2026-06-25; DICE retry fix not yet in place)
- The DICE retry-on-429 fix was merged 2026-06-26 (#737)
- easystreetonline.com returns 403 from the remote execution environment
- geo: 47.5612832, -122.3869565 (4559 California Ave SW, verified via Nominatim)

Retrying 2026-06-30:
- First attempt with venueName: "Easy Street Records" → 0 events + 1 parse error (same pattern as June 25)
- All existing DICE sources (sunset-tavern, black_lodge, kremwerk, etc.) returned 0 events with NO parse errors in the same CI run — confirming the DICE API is functional but "Easy Street Records" is not a recognized venue name
- Second attempt: switching to venueName: "Easy Street Records & Cafe" (Songkick lists venue as "Easy Street Records & Cafe - West Seattle")
