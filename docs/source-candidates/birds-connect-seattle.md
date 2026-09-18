---
name: "Birds Connect Seattle"
status: added
platform: Tockify (ICS)
url: https://www.birdsconnectsea.org/calendar/
tags: [Education, Community]
firstSeen: 2026-06-18
lastChecked: 2026-09-18
pr:
---
Seattle-based birding and bird conservation organization (formerly the
Seattle Audubon Society; not to be confused with the separately-run
**Seward Park Audubon Center**, `docs/source-candidates/seward-park-audubon.md`,
a National Audubon Society nature center at a different physical location —
though Seward Park's `imageUrl` happens to reuse this org's logo). Hosts
field trips, neighborhood bird outings, lunch-and-learn talks, and
accessibility-focused events.

Investigated 2026-06-18: WordPress confirmed, but no Tribe Events ICS export
and no other machine-readable feed found in the static HTML — filed
`notviable`.

**Update 2026-09-18:** Re-investigated. The `/calendar/` page actually embeds
a **Tockify** calendar widget (`<iframe src="https://tockify.com/birds.connect.sea/agenda">`),
which exposes a standard public ICS export at
`https://tockify.com/api/feeds/ics/birds.connect.sea` — confirmed live
(HTTP 200, 101 VEVENTs, ~49 with a start date on/after today). Most events
carry a real structured `LOCATION` (street address); the large majority are
in Seattle proper (BCS HQ at 616 Olive Wy, Union Bay Natural Area, Seward
Park Nature Center, Carkeek Park, Ballard Locks, etc.), with a handful of
field trips at nearby regional sites (Redmond, Edmonds, Kirkland, Issaquah,
Olympia) — acceptable under the "few events outside city limits" rule since
the majority are Seattle-located. Implemented as
`sources/external/birds-connect-seattle.yaml` (best-case ICS integration,
no custom code). `sourceRole: venue` (first-party organizer of its own
programming, same shape as Green Seattle Partnership/PSMS), `geo: null`
(per-event geocoding across many locations), `weatherSetting: "mixed"`
(events are a genuine mix of indoor HQ presentations and outdoor field
trips/walks — per `lib/config/tags.ts`, `Outdoors` is reserved for
unambiguously open-air sources, so it's omitted here in favor of the mixed
overlay). Tags `Education`, `Community`. 101 raw events / 57 in the
near-term index, 0 parse errors, 4 non-fatal geocode errors (a few
imprecise park-parking-lot addresses — left for the geo-resolver queue),
verified via `ONLY_SOURCE=birds-connect-seattle npm run generate-calendars`;
full `npm run test` (3919 tests, 223 files) green.
