---
name: "Easy Street Records"
status: added
platform: DICE
url: https://easystreetonline.com/events
tags: [Music, "West Seattle"]
firstSeen: 2026-06-25
lastChecked: 2026-06-25
---

Legendary West Seattle record store and café at 4559 California Ave SW (Alaska Junction). Hosts in-store performances, album release parties, live music events. One of the most celebrated independent record stores in the US, with events listed on DICE.

Investigated 2026-06-25:
- DICE venue confirmed at `dice.fm/venue/easy-street-records-lg5w`
- DICE API (`events-api.dice.fm`) is accessible from GitHub Actions CI (same as all other DICE sources: Kremwerk, Belltown Yacht Club, Vera Project, Black Lodge, Sunset Tavern)
- DICE API and dice.fm are blocked from the remote execution environment; verification requires CI
- Venue name derived from DICE URL slug: `easy-street-records-lg5w` → "Easy Street Records"
- easystreetonline.com returns 403 from the remote execution environment
- geo: 47.5612832, -122.3869565 (4559 California Ave SW, verified via Nominatim)

Implemented 2026-06-25 as `sources/easy_street_records/ripper.yaml` (type: dice, venueName: "Easy Street Records").
Tags: Music, West Seattle. defaultDurationHours: 3.
