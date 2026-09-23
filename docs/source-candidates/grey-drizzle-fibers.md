---
name: "Grey Drizzle Fibers"
status: added
platform: Squarespace
url: https://www.greydrizzlefibers.com/events
tags: [Community]
firstSeen: 2026-07-19
lastChecked: 2026-09-23
pr: 1574
---

Fiber arts business (yarn, knitting/spinning classes and retreats) based
at 18412 SE Lake Youngs Rd, Renton, WA — outside Seattle proper — but it
organizes/curates fiber events at rotating locations including Seattle.

Investigated 2026-07-19:
- Confirmed Squarespace with a real events collection
  (`/events?format=json` → `collection.typeName: "events"`,
  `itemCount: 71`)
- 2 upcoming events: "Flock Fiber Festival" (Summit Building, 705 Pike
  Street, **Seattle**, WA 98101) and "KnitEscape Retreat" (North Bend, WA
  — outside Seattle)
- Only 1 of the 2 live events is in Seattle proper, and the organizing
  business itself is Renton-based — borderline on the "primarily serving
  Seattle audiences" rule (venues entirely outside Seattle are not
  appropriate; a business based outside Seattle whose events are mostly
  elsewhere is a weaker fit than a genuine Seattle-area organizer)
- Re-evaluate if more Seattle-located events appear on the calendar,
  tipping the balance toward "primarily Seattle"

Re-checked 2026-07-22: still 2 upcoming events, same Seattle/North Bend
split as before. No change.

Re-checked 2026-09-03: the Seattle-located "Flock Fiber Festival" has since
passed and dropped off `upcoming`. The 2 currently-live events are now
"KnitEscape Retreat" (North Bend, WA) and "The Knitters Studio Trunk Show"
(Bellevue, WA) — **0 of 2** in Seattle proper. Confirms the underlying
pattern: this Renton-based organizer's calendar is only occasionally
Seattle-located, not primarily. Deprioritizing further re-checks unless a
future scan turns up a run of Seattle-located events.

Checked 2026-09-23 (notviable): Outside Seattle: Renton-based organizer whose live events are in North Bend and Bellevue (0 of 2 upcoming in Seattle). Closing rather than re-checking.

**Re-evaluated 2026-09-23 (King County rule) -> added.** Renton, Bellevue, and North Bend are all King County, so the "mostly outside Seattle" objection no longer applies. Squarespace `?format=json` has 1 upcoming event: "The Knitters Studio Trunk Show" (Bellevue, 2026-12-12). New source: `sources/grey_drizzle_fibers/` (name `grey-drizzle-fibers`, built-in `squarespace` type, `geo: null` because events rotate locations, tag `Community`). 1 event in the local ONLY_SOURCE build. It is low volume, so it may need `expectEmpty: true` later if the calendar empties between events.
