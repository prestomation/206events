---
name: National Whiskey Sour Day
status: candidate
platform: SpotHopper
url: https://bathtubginseattle.com/events
tags: ["food", "nightlife"]
firstSeen: 2026-08-25
lastChecked: 2026-09-17
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: bathtubginseattle.com.

Sample event: "National Whiskey Sour Day" (2026-08-25T18:00:00.000Z)
Description: It's National Whiskey Sour Day! Come down and let our awesome bartenders make you a great Whiskey Sour!

**Investigated 2026-09-17:** confirmed SpotHopper (same platform as
`sources/baba_yaga`, `sources/angry_beaver_seattle`, `sources/sullys_queen_anne`,
`sources/bad_alberts`), spot id `62757` (found in the site's own
`events_calendar_script.js` config and texting-permission link). But
`https://www.spothopperapp.com/api/spots/62757/events` currently returns
`{"events":[],...,"total_records":11}` — 11 records exist in SpotHopper's
backend but none are marked visible on the public site (the `/events` page
itself also renders no event cards). Per the "200 + 0 visible events" rule,
do not implement yet; re-check next cycle in case the venue starts
publishing events again.
