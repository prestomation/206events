---
name: Vashon Events
status: candidate
platform: Squarespace
url: https://www.vashonevents.org/events
tags: [Vashon]
firstSeen: 2026-09-26
lastChecked: 2026-09-26
pr:
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
