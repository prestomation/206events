---
name: "Easy Street Records"
status: candidate
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
- DICE API and dice.fm are blocked from the remote execution environment; venueName cannot be verified locally
- Venue name derived from DICE URL slug: `easy-street-records-lg5w` → "Easy Street Records"
- CI trial on 2026-06-25 (`sources/easy_street_records/ripper.yaml`, venueName: "Easy Street Records") returned 0 events + 1 parse error from the DICE API — venueName is likely wrong or the venue uses a slightly different display name on DICE (compare: "Kremwerk Complex", "The Vera Project", "The Black Lodge", "The Sunset Tavern")
- easystreetonline.com returns 403 from the remote execution environment
- geo: 47.5612832, -122.3869565 (4559 California Ave SW, verified via Nominatim)

**Next steps**: Determine the correct DICE display name for this venue. Options: access dice.fm/venue/easy-street-records-lg5w in a browser to read the venue title, or try "Easy Street Records & Cafe" / "Easy Street Records Cafe". Once venueName is confirmed (returns ≥1 event from the DICE API), re-implement as `type: dice` with `geo: {lat: 47.5612832, lng: -122.3869565}`. Tags: Music, West Seattle.
