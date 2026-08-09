---
name: "Mr. B's Meadery"
status: added
platform: Squarespace
url: https://www.mrbsmeadery.com/events
tags: [Mead, "White Center"]
firstSeen: 2026-08-08
lastChecked: 2026-08-09
pr: TBD
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

Implementation note: because events split across two addresses via the
per-event `location` field rather than a single fixed venue, this may need
per-event geocoding/location handling rather than a single `defaultLocation`
— check `lib/config/squarespace.ts` for how per-event location overrides are
supported before implementing.

**Implemented 2026-08-09** (`sources/mr_bs_meadery/ripper.yaml`, built-in
`squarespace` type): confirmed 32 upcoming events, 0 parse errors, at
`ONLY_SOURCE=mr-bs-meadery`. Used `geo: null` at the ripper level (per the
implementation note above) so each event's `location` string is geocoded
individually via the shared geo-cache rather than pinned to one fixed venue
— 30 of 32 events are at the Delridge Way (White Center) address, with a
couple of off-site events (e.g. a Randle, WA venue) geocoding independently.
Tags: `Mead`, `White Center` (both new to `TAG_CATEGORIES`/neighborhoods are
already registered — `White Center` was already a known neighborhood).
