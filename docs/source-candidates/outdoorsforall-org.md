---
name: "Outdoors for All Foundation"
status: added
platform: "WordPress (Modern Events Calendar RSS feed)"
url: https://outdoorsforall.org/events/feed/
tags: [Outdoors]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr: 1516
---

Seattle-based (Magnuson Park HQ, `6344 NE 74th St, Seattle, WA 98115`)
adaptive-recreation nonprofit providing outdoor and fitness programs for
children and adults with disabilities.

Discovered via aggregator gap analysis 2026-08-25 ("Kayaking at Lake
Sammamish", 3 events in the Seattle metro sample).

**Investigated/implemented 2026-09-16:**
- Confirmed the same WordPress "Modern Events Calendar" plugin combo already
  used by `sources/kandelia` and `sources/seattle_drum_school` — the
  `/events/feed/` RSS export carries `mec:startDate`/`mec:startHour`/
  `mec:endDate`/`mec:endHour`/`mec:location` fields per item.
- The org is regional (Puget Sound-wide), not Seattle-only: the live feed
  also lists hikes/gravel rides at Cascade-foothill trailheads
  ("Snoqualmie Valley Trail", "i-90 Corridor") and one Bellevue location
  (`15600 NE 8th St, Bellevue, WA 98008`, Indoor Rock Climbing). Per the
  Seattle-focus rule, implemented with a `KNOWN_SEATTLE_VENUES` allowlist
  (Magnuson Park, Old Stove Brewing Ballard) that drops every other
  location — same shape as `sources/northwest_trail_runs`' `eventSlugs`
  allowlist.
- 2 recurring "Learn to Ride" occurrences omit a start time in the feed
  (`mec:startHour` blank) — routed through the event-uncertainty system
  (`UncertaintyError`, placeholder noon time) rather than dropped or guessed.
- 4 Seattle-located events, 2 non-fatal Uncertainty errors, 0 parse errors,
  verified via `ONLY_SOURCE=outdoors-for-all npm run generate-calendars`.
  Geocoding resolved both known addresses correctly. Full `npm run test`
  (3805 tests) and `npm run typecheck` both green.
- `sourceRole: venue`, `geo: null` (two fixed Seattle addresses), tag
  `Outdoors` (matches the org's primary identity).

See PR #1516.
