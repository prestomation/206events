---
name: "HONK! Fest West"
status: added
platform: Astro (static site)
url: https://honkfestwest.org/
tags: [Music, Community]
firstSeen: 2026-06-17
lastChecked: 2026-06-17
pr: 666
---
**HONK! Fest West** — `https://honkfestwest.org/` — Annual free street-band festival with 30+ brass, percussion, and activist bands performing in public spaces across Seattle neighborhoods. Free and all-ages.

Investigated 2026-06-17:
- Static site built on Astro (no server-side calendar API)
- No ICS/iCal export
- 2026 dates: May 29–31 (last Fri–Sun of May); Georgetown Fri 6–10pm, Columbia City Sat noon–8pm, Pratt Park Sun noon–6pm
- Neighborhoods rotate year to year; 2022 included Ballard and Yesler Terrace
- No fixed venue → geo: null

**Verdict**: Added as `sources/recurring/honk-fest-west.yaml` using last Fri/Sat/Sun of May schedule. Comment notes neighborhoods rotate and dates should be verified annually at honkfestwest.org.
