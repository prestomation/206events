---
name: "Mr. B's Meadery"
status: added
platform: Squarespace
url: https://www.mrbsmeadery.com/events
tags: [Mead, "White Center"]
firstSeen: 2026-08-08
lastChecked: 2026-08-09
pr:
---
**Mr. B's Meadery** — two locations: Mr. B's Mead Center, 9444 Delridge Way
SW, Seattle, WA 98106 (White Center) and the original "Hobbit Hole" location
in Fremont. Events collection lives at
`https://www.mrbsmeadery.com/events?format=json` — verified 2026-08-08:
`upcoming` array has 32 entries with real epoch `startDate` values in the
future (e.g. `1786309200578` → 2026-08-09 21:00 PT). Each event has a
`location` object with `addressTitle`/`addressLine1`/`addressLine2`, which
differs by which of the two physical locations is hosting.

Event mix: weekly/monthly recurring community programming — Everyone Plays
Game Cafe, Snail Mail Sundays, trivia, live music (all-ages, free), Rat City
Art Walk participation (3rd Thursday), Happy Hour meetups. Secular, not a
one-off — 🔥 High confidence built-in Squarespace type.

Implementation note: `SquarespaceRipper.mapEvent` already builds the
per-event `location` string from the source's own `location` object, so no
custom ripper code was needed. Of the 32 live events, all but a couple are
at the White Center Mead Center address; ripper-level `geo` was set to that
flagship venue (`sourceRole: venue`), matching the pattern used for other
single-primary-address sources — the couple of off-site events (e.g. a Hall
at Fauntleroy show) still carry a correct `LOCATION:` text string in the
ICS, just pinned to the primary venue's coordinates on the map. Implemented
2026-08-09 as `sources/mr_bs_meadery/` — `ONLY_SOURCE=mr_bs_meadery npm run
generate-calendars` produced 32 events, 0 errors.
