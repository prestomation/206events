---
name: "Orca Running"
status: added
platform: Custom (RunSignUp public REST API)
url: https://www.orcarunning.com/races/
tags: [Running, Outdoors]
firstSeen: 2026-09-15
lastChecked: 2026-09-15
pr: 1478
---

PNW race organizer (half marathons, 5K/10K fun runs, an overnight ultra)
that puts on races across Washington — most outside Seattle proper
(Kirkland, Redmond, Poulsbo, Blaine, Bainbridge Island, San Juan Island,
Carnation, North Bend), but 4 of its recurring annual races are held
inside Seattle city limits.

Investigated 2026-09-15:
- Found via `orcarunning.com`'s race list. Each race page links to
  `runsignup.com/Race/WA/<city>/<Slug>`, and RunSignUp exposes a public,
  keyless REST endpoint per race: `https://runsignup.com/Rest/race/<id>?format=json`
  — confirmed working with real structured data (name, address with
  `city`, per-heat `events[]` with `start_time`/`end_time`, and
  `registration_periods[].race_fee`).
- Filtered to the 4 races whose `address.city === "Seattle"`: The Brooks
  Orca Half Marathon (Alki/Harbor Ave), Pumpkin Spice Run (Seward Park),
  The Electric Cookie Run (Green Lake), and One Step Closer (an 18-hour
  overnight ultra at Lincoln Park). The rest of the org's ~15-race
  calendar (Kirkland Half, Captain Jack's Treasure Run in Redmond,
  Poulsbo Half, Craft Classic in Redmond despite the "Seattle" in its
  name, Lake Sammamish Half, Snoqualmie Valley Half, Iron Horse Half,
  Birch Bay Road Race, San Juan Island Half, The Great Ferry Race, Run
  The Green in Kent) is outside Seattle and intentionally excluded —
  hand-maintained `raceIds` allow-list in `ripper.yaml`, not a
  city-wide scrape.
- Implemented as a custom `IRipper` (`sources/orca_running/ripper.ts`,
  no built-in ripper type fits a fixed-race-ID REST lookup). Each race's
  `events[]` array mixes every past year plus "Virtual"/"Challenge"
  self-paced options; the ripper keeps only future-dated, non-virtual
  heats and groups same-day heats (e.g. 5K + 10K on one Pumpkin Spice
  Run morning) into a single calendar event, using the earliest start
  and the widest end time as the window, with a 3-hour fallback duration
  when the API gives no end time. Cost is derived from the
  currently-open (or nearest upcoming) `registration_periods` fee
  across that day's heats, giving a real `{min, max}` range.
- Verified via `ONLY_SOURCE=orca_running`: 5 upcoming events, 0 parse
  errors — Orca Half (Sat + Sun editions), Pumpkin Spice Run, Electric
  Cookie Run, and next year's One Step Closer, each with a correct
  address, URL, and price range. `sourceRole: venue` (first-party
  programming, like SPL's multi-branch pattern), `geo: null` at the
  ripper level since the 4 races are at different parks — per-event
  location strings resolve through the normal geocoder.
- `Running` and `Outdoors` tags already existed in `lib/config/tags.ts`;
  no new tag registration needed.
