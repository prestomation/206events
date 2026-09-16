---
name: Bluegrass Jam
status: added
platform: Elfsight "Event Calendar" widget (public JSON boot API)
url: https://www.machinehousebrewery.com/calendar/
tags: ["Music", "Rainier Valley"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr: 1504
---

Discovered via aggregator gap analysis. 3 events in the Seattle
metro sample. Source domain: machinehousebrewery.com.

Sample event: "Bluegrass Jam" (2026-08-27T02:00:00.000Z)
Description: Free live bluegrass jam at Machine House Brewery. All ages welcome.

**2026-09-11:** Re-confirmed — WordPress site, `/calendar/` has no
Tribe Events (or other recognizable calendar plugin) signature, and no
event data appears in the static HTML (JS-rendered widget). No change
from prior finding; left as `candidate` pending a future look at
whether the underlying widget has a discoverable API.

**Implemented 2026-09-16:** The `/calendar/` page embeds four Elfsight
widgets (`class="elfsight-app-<uuid>"`); one of them
(`f9f88672-930f-425d-a91c-562544d4dca3`) is an `event-calendar` app.
Elfsight's config API is public and unauthenticated — fetching
`https://core.service.elfsight.com/p/boot/?page=<url>&w=<widget-id>`
returns the widget's full `settings.events` array as JSON, no headless
browser needed. The array holds 104 entries, but 101 are one-off sports
watch parties (Sounders, Arsenal, World Cup, etc.) that are all
historical — 0 have a future `start.date`. Of the 3 `repeatPeriod:
"weeklyOn"` recurring entries, 2 (Rainier Beach Running Club, Pub Quiz
with King Trivia) carry a `repeatEnds: "onDate"` with a 2024
`repeatEndsDate` — their series formally ended over a year ago and
aren't live. Only **Bluegrass Jam** has `repeatEnds: "never"`, matching
its own description ("every Wednesday from 7pm to 9:30pm... all ages
and skill levels"). Its raw event entry also carries explicit `tags:
[{"tagName": "FREE"}, {"tagName": "All ages"}]` metadata, confirming
`cost: free` directly from the source rather than inferring it.

The venue itself has also moved since this candidate was first filed —
confirmed current address via `/contact/`: 5718 Rainier Ave S, Seattle,
WA 98118 (Hillman City, matches OSM node 2429641156 exactly). Tagged
`Rainier Valley` per the existing neighborhood-tag convention (no
dedicated "Hillman City" tag registered; `filipino_community_seattle`
uses the same fallback).

Implemented as `sources/recurring/machine-house-brewery.yaml` (`geo`
fixed, `sourceRole: venue`, `cost: free`), same shape as
`owl-n-thistle-jazz-jam` (single weekly recurring music event at a
bar). 1 event, 0 parse errors, verified via
`ONLY_SOURCE=machine-house-brewery-bluegrass-jam npm run generate-calendars`.
