---
name: "FIUTS"
status: added
platform: Squarespace
url: https://www.fiuts.org/calendar
tags: [Community, "University District"]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
pr: 1518
---

FIUTS (Foundation for International Understanding Through Students) is a
Seattle nonprofit connecting international and local students in the
Puget Sound area — conversation groups, Welcome Week programming (BBQ &
block party, networking mixer, cultural workshops), and social outings
like a weekly-ish "FIUTS goes to Trivia Night at Big Time Brewery".

Investigated 2026-09-16:
- Confirmed Squarespace (`squarespace-cdn.com` asset URLs, `Squarespace`
  server header). `/calendar?format=json` is a **calendar-view** events
  collection (`collection.typeName: "events"`, `itemCount: 2098`,
  `calendarView: true`) that defaults to the current month and paginates
  forward via `pagination.nextPageUrl` (`?month=<name>-<year>&view=calendar`)
  — the built-in `SquarespaceRipper`'s pagination loop follows this
  automatically up to `MAX_PAGES`.
- `upcoming` is empty (calendar-view responses use `items` instead), but
  `items` returned 8 real events for September 2026 with genuine future
  `startDate` timestamps (through Oct 1, 2026): Welcome to Seattle Week
  (Community BBQ & Block Party, Networking Mixer, Chinese Traditional Art
  Workshop) and repeated "FIUTS goes to Trivia Night at Big Time Brewery"
  outings.
- Every sampled event's `location` field reports the same FIUTS office
  address (909 NE 43rd St, Seattle, WA 98105) regardless of the event's
  actual venue (e.g. the Trivia Night events are physically at Big Time
  Brewery) — a source data-quality quirk, not a ripper bug. Since every
  event resolves to the identical string, per-event geocoding
  (`geo: null`) would provide zero differentiation while also hiding the
  source from `venues.json`/the map/neighborhood tag feeds — same
  situation as the already-covered `u-district-partnership` and
  `university-heights-center` sources, both of which use a fixed
  ripper-level `geo`. Followed that precedent instead: fixed `geo`
  pointing at the OSM node for FIUTS itself (`node/10536919009`,
  confirmed via Nominatim — "Foundation for International Understanding
  Through Students", 909 NE 43rd St).
- Not a religious org; not found under `sources/` or any existing
  candidate file.

Implemented as `sources/fiuts/ripper.yaml` using the built-in
`squarespace` ripper type — no custom code needed. `sourceRole: venue`
(first-party organizer of its own programming), fixed `geo` (OSM node
10536919009), tags `Community` and `University District`. Verified via
`ONLY_SOURCE=fiuts npm run generate-calendars`: 36 events, 0 parse
errors. `npm run typecheck` clean. PR #1518.
