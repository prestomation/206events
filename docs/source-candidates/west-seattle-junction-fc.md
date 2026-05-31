---
name: "West Seattle Junction FC"
status: added
platform: custom HTML (WordPress/Gutenberg)
url: https://www.wsjunctionfc.club/2026-schedule/
tags: [Sports, "West Seattle"]
firstSeen: 2026-05-31
lastChecked: 2026-05-31
---

USL League Two amateur men's soccer team based in southwest Seattle. Plays home
matches at Nino Cantu SW Athletic Complex (Arroyo Heights/White Center area).
Sister club Salmon Bay FC (USL W League women's side) shares the same organization
and can be added in a follow-up.

Investigated 2026-05-31:
- Schedule at `https://www.wsjunctionfc.club/2026-schedule/` — WordPress/Gutenberg blocks
- Home games use `div.GameContainer.HomeGame` class with structured h3/h5 elements:
  - h3: date ("Sunday, June 7")
  - h5[0]: "HOME"
  - h5[1]: "Junction FC" (home team)
  - h5[2]: opponent name
  - h5[3]: "H:MM PM | Nino Cantu Memorial Stadium" (upcoming) or "FULLTIME | ..." (completed)
- 6 upcoming home games confirmed (June–July 2026)
- No ICS feed or public API — custom HTML ripper required
- Stadium (Nino Cantu SW Athletic Complex) not found in OSM under that name;
  approximate coordinates used (47.5073, -122.3841)

Tags: Sports, West Seattle
