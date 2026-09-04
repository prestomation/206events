---
name: "Bush Garden"
status: added
platform: Recurring YAML (no feed — nightly hours pattern)
url: https://www.bushgardenseattle.com/
tags: [Nightlife, "International District"]
firstSeen: 2026-09-04
lastChecked: 2026-09-04
pr:
---

Seattle's legendary Chinatown-International District karaoke bar and
Japanese restaurant (originally opened 1953), which reopened June 3,
2026 at a new location — 714 S King St, Seattle, WA 98104 — after a
multi-year closure.

Investigated 2026-09-04:
- Site is Wix-hosted (`wixstatic.com` assets); no events page, ICS feed,
  or API — just a homepage mentioning "Karaoke Nightly @ 9:30pm".
- Confirmed exact schedule via press coverage (Seattle Times, KUOW,
  NW Asian Weekly, WhatNow Seattle): karaoke runs 9:30pm–1:30am every
  night except Tuesday (closed). Family-friendly restaurant hours run
  3–9pm before the 21+ karaoke transition.
- Implemented as a recurring YAML
  (`sources/recurring/bush-garden-karaoke.yaml`) with 6 weekly schedule
  entries (every day except Tuesday), same pattern as the existing
  `unicorn-seattle-karaoke` / `the-dock-karaoke` recurring sources.
- `cost` left unset — no confirmed cover-charge info found; will fall
  into the cost-gap queue for later resolution rather than guessing
  "free".
- Nominatim's structured geocoder returns a generic "South King Street"
  road segment ~700m away (near Yesler Terrace) for the house-number
  address instead of the actual building. Added a `KNOWN_VENUE_COORDS`
  entry in `lib/geocoder.ts` keyed on the exact `location` string,
  using the coordinates from the OSM node tagged `amenity=karaoke_box`
  named "Bush Garden" (node 13874560124, 47.5984956, -122.3226719).
- 6 events, 0 errors confirmed via `ONLY_SOURCE=bush-garden-karaoke npm run generate-calendars`.
