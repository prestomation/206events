---
name: "Wanderlust Nursery"
status: notviable
platform: Squarespace
url: https://wanderlustnursery.com/events
tags: [Community]
firstSeen: 2026-07-23
lastChecked: 2026-08-16
---

Plant nursery/garden business (Seattle-based per site metadata) that
curates a regional calendar of plant sales, garden open houses, and
fundraisers — found while searching "Seattle community garden events
calendar."

Investigated 2026-07-23:
- Confirmed Squarespace (`squarespace-cdn.com` assets, `?format=json`
  returns a valid site payload; `collection.typeName: "events-stacked"`)
- `upcoming` array is currently **empty** (`0` events); `past` has 19
  entries, most recently a handful of March–April 2026 plant sales/open
  houses (NPA March Mania, RSBG Pop-up, Shark Garden Spring Open House,
  NPA Spring Plant Sale) that have since lapsed into the past bucket.
- Per the "200 + 0 events" rule, do not implement yet.
- Seattle-focus caveat for next check: several past events were hosted at
  other-city venues (Bellevue Botanical Garden, Rhododendron Species
  Botanical Garden) rather than at a Wanderlust Nursery location — worth
  confirming what fraction of future events are Seattle-proper once
  `upcoming` repopulates, per the "primarily serving Seattle audiences"
  quality gate.

Re-check next cycle to see if `upcoming` populates and whether the events
listed are majority Seattle-based.

**Re-checked 2026-08-16:** `upcoming` has now repopulated — 4 events with
future `startDate` values (confirms the Squarespace events collection
works as expected). But the Seattle-focus caveat resolved negative: only
1 of the 4 (Admiral Block Party, West Seattle) is in Seattle proper. The
other 3 are at PowellsWood Garden (Federal Way) and Bellevue Botanical
Garden ×2 (Bellevue) — same pattern as the 19 `past` entries checked
7/23 (SeaTac, Burien, Federal Way, Bellevue, Tacoma dominate). This is a
regional plant-events curator that occasionally touches Seattle, not a
primarily-Seattle source — fails the "must primarily serve Seattle
audiences" gate. Marking `notviable`.
