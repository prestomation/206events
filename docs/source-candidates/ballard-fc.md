---
name: Ballard FC
status: added
platform: SportsEngine (custom HTML scraper)
url: https://www.goballardfc.com/schedule/
tags: [Sports, Ballard]
firstSeen: 2026-05-08
lastChecked: 2026-05-19
pr: pending
---

USL League Two amateur men's soccer team based in Seattle's Ballard
neighborhood. Plays home matches at Interbay Stadium (1700 15th Ave W area).

Investigated 2026-05-18:
- Site uses **SportsEngine** (not Squarespace as originally suspected)
- `?format=json` returns HTML, not JSON — Squarespace API not available
- Schedule data is present in HTML (upcoming matches through July listed)
- Would need custom HTML scraper to parse SportsEngine schedule table
- Tickets sold via `tickets.upthebridges.shop`
- Sister club Salmon Bay FC (USL W League women's side) shares the same
  site and would be addable in the same source

Implemented 2026-05-19:
- Custom HTML ripper parses `GameContainer HomeGame` divs from schedule page
- 7 home games confirmed (May 15 – July 12, 2026)
- Tags: Sports, Ballard
