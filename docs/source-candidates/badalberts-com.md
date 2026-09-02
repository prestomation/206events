---
name: Bad Albert's Tap & Grill
status: added
platform: Custom HTML (Spot bar-events widget)
url: https://badalberts.com/-events
tags: ["Nightlife", "Ballard"]
firstSeen: 2026-08-25
lastChecked: 2026-09-02
pr:
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: badalberts.com.

Sample event: "National Whiskey Sour Day" (2026-08-25T18:00:00.000Z)
Description: It's National Whiskey Sour Day! Come down and let our awesome bartenders make you a great Whiskey Sour!

**Implemented 2026-09-02:** Ballard bar/grill (5100 Ballard Avenue NW,
Seattle, WA 98107; OSM node 2138389815). Runs on the "Spot" bar-events
widget (`static.spotapps.co`) — each event is a `<section id="...">`
carrying an "add to calendar" block with machine-readable `.atc_*` vars
(`atc_date_start`/`atc_date_end`/`atc_timezone`/`atc_title`), so no
free-text date parsing is needed. Confirmed 3 live events at
implementation time (Labor Day, National Sandwich Day, an annual St.
Paddy's Day karaoke night) — low but valid volume per the "Low-Volume
Sources Are Valid" directive. No cover charge mentioned on any event;
ripper-level `cost: free`. Custom `HTMLRipper` in
`sources/bad_alberts/ripper.ts`.
