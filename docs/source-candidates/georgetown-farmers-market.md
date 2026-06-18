---
name: "Georgetown Farmers Market"
status: added
platform: recurring YAML
url: https://georgetownseattle.org/georgetown-farmers-market/
tags: [Georgetown, FarmersMarket, Community]
firstSeen: 2026-06-18
lastChecked: 2026-06-18
---
Seasonal Thursday farmers market in Georgetown, organized by the Georgetown Business Association (GBA). Located outside Bloom Bistro at 6601 Carleton Ave S, Seattle, WA 98108. Features local produce, food vendors, and artisans. Accepts SNAP/EBT.

Investigated 2026-06-18:
- Schedule: Every Thursday, 3–7 PM, May 7 – October 1, 2026 (months 5–10)
- Confirmed via seattlefreshbucks.org listing and GBA website
- georgetownseattle.org returned 503; confirmed details via seattlefreshbucks.org (Thursday: May 7–October 1, 3–7 p.m.)
- No ICS/Squarespace feed available; implemented as recurring YAML
- geo: 47.5442037, -122.3214361 (from Nominatim)
- Build test: 1 recurring event generated (RRULE), 0 errors

Implemented as `sources/recurring/georgetown-farmers-market.yaml`.
