---
name: Ballard FC
status: investigating
platform: SportsEngine
url: https://www.goballardfc.com/schedule/
tags: [Sports, Ballard]
firstSeen: 2026-05-08
lastChecked: 2026-05-18
---

USL League Two amateur men's soccer team based in Seattle's Ballard
neighborhood. Plays home matches at Memorial Stadium (and historically
at Interbay Stadium). 2026 season schedule is published on the team
site but no ICS subscription URL is exposed.

Investigated 2026-05-18:
- Site uses **SportsEngine** (not Squarespace as originally suspected)
- `?format=json` returns HTML, not JSON — Squarespace API not available
- Schedule data is present in HTML (upcoming matches through July listed)
- Would need custom HTML scraper to parse SportsEngine schedule table
- Tickets sold via `tickets.upthebridges.shop`
- Sister club Salmon Bay FC (USL W League women's side) shares the same
  site and would be addable in the same source

Custom HTML scraper is feasible but low priority — keep investigating.
