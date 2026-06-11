---
name: "Fashion District NW"
status: added
platform: Squarespace
url: https://www.fashiondistrictnw.com/events
tags: [Arts, Community]
firstSeen: 2026-06-11
lastChecked: 2026-06-11
pr: 605
---
**Fashion District NW** — `https://www.fashiondistrictnw.com/events` — Pacific Northwest fashion organization producing designer showcases, model castings, and networking events. Hosts the annual "Fashion in Flight" show at The Museum of Flight (Seattle).

Investigated 2026-06-11:
- Squarespace confirmed (events-stacked collection)
- `?format=json` returns 2 upcoming events: Fashion in Flight model casting (Aug 30, 2026) and Fashion in Flight show (Nov 7, 2026) — both at The Museum of Flight, Seattle
- Total itemCount: 59 events (most are past)
- Both upcoming events are in Seattle; organization also holds events in Portland and Vancouver BC
- geo: null (event org, not a fixed venue)
- Accessible: 200 OK from sandbox
- Added as `type: squarespace` ripper — 2 events confirmed in CI
