---
name: Vashon Events
status: added
platform: Squarespace
url: https://www.vashonevents.org/events
tags: [Vashon, Community]
firstSeen: 2026-09-26
lastChecked: 2026-09-27
pr: 1607
---

Community events organization for Vashon Island (King County). Confirmed
Squarespace `?format=json` returns 38 `upcoming` items with `startDate`
epoch values in the future (e.g. "Hair Tinsel Pop Up!", "Kanekoa",
"Vashon Opera presents A Masked Ball by Verdi") and 30 `past`. No single
fixed venue — events span multiple Vashon locations (Vashon Center for
the Arts, Vashon Village Green, private venues), so this is an
**aggregator** (`sourceRole: aggregator`, `geo: null`), similar to
`seattle_showlists`. `Vashon Center for the Arts` (already a source) may
overlap with some listings here — check for duplicates against
`sources/vashon_center_for_the_arts/` when implementing; cross-source dedup
should catch true duplicates automatically. Built-in `squarespace` type,
high confidence — no custom scraper needed.

Implemented 2026-09-27: `sources/vashon_events/ripper.yaml`, built-in
`squarespace` type, `sourceRole: aggregator`, `geo: null`, tags `["Vashon",
"Community"]`. `ONLY_SOURCE=vashon-events npm run generate-calendars`
confirmed 36 events, 0 errors. Cross-source dedup against
`vashon_center_for_the_arts` runs automatically in the full build.
