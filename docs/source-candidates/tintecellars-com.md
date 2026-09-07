---
name: "Tinte Cellars"
status: added
platform: ICS (WordPress / The Events Calendar)
url: https://tintecellars.com/events/
tags: [Wine, Georgetown]
firstSeen: 2026-08-25
lastChecked: 2026-09-07
pr:
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: tintecellars.com.

Sample event: "Wine & Watercolors with Jenna Brechbiel (GEORGETOWN)" (2026-08-26T17:00:00.000Z)
Description: Join us at Tinte Cellars Georgetown for Wine & Watercolors with local artist Jenna Brechbiel. All levels welcome. All supplies provided. Social Hour 5-6 PM, Instruction and painting 6-8 PM. Welcome po

**Implemented 2026-09-07:** Winery with a Georgetown tasting room (5951
Airport Way S, Seattle, WA 98108). Confirmed WordPress + The Events
Calendar plugin — valid ICS export at
`https://tintecellars.com/?post_type=tribe_events&ical=1&eventDisplay=list`
(also linked from the site's Google/Outlook/webcal subscribe buttons).
Fetched live: 9 VEVENTs, dated through mid-2027 (art shows, a wine &
watercolors/floral-design craft series, seasonal release events).
5 of 9 are explicitly at the Georgetown (Seattle) tasting room; the
rest are at the org's other locations (Woodinville, Red Mountain
estate) or unspecified — majority-Seattle, so added as
`sources/external/tinte-cellars.yaml` with `geo: null` (multi-location)
and `sourceRole: venue` (one org's own set of venues). Not previously
covered under `sources/`. Verified via
`ONLY_SOURCE=tinte-cellars npm run generate-calendars`: 9 events, 0
parse/config errors (one non-fatal geocode error on the Red Mountain
rural address, expected and unrelated to this source's viability).
