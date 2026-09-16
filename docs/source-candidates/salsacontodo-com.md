---
name: Salsa Con Todo
status: added
platform: Wix Bookings (SYNC widget, JS-rendered) — hand-coded recurring YAML instead
url: https://www.salsacontodo.com/drop-ins
tags: ["Dance", "Fremont"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr: 1515
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: salsacontodo.com.

Sample event: "Monday Brazilian Zouk Social" (2026-08-25T05:00:00.000Z)
Description: Every Monday Brazilian Zouk social dancing. 10 PM - 12 AM. $10 cover.

Re-checked 2026-09-16: site is a Wix "Bookings" business (`Calendar SYNC`,
booking-flow strings in the plain-fetched HTML) — drop-in class times are
rendered by a client-side Wix Bookings widget, no static event data in the
initial HTML and no obvious JSON endpoint found. Would need headless-browser
rendering to scrape reliably.

Implemented 2026-09-16: a plain `curl` fetch of `/drop-ins` (no JS
rendering) turned out to render the socials list server-side after all —
the earlier "JS-rendered" call was a false negative. The page text lists
4 fixed weekly socials at their Fremont studio (211 N 36th St, Seattle, WA
98103, confirmed via exact OSM node match):
- "MONDAY BRAZILIAN ZOUK SOCIAL — Every Monday 10 PM - 12 AM $10 Cover"
- "WESTIE LAB SOCIAL — Every Thursday 10 PM - 12 AM $10 Cover"
- "SALSA,BACHATA, BRAZILIAN ZOUK + KIZOMBA — Every Friday 10:15 PM - 1:00 AM $15 - pre-register $20 - at the door"
- "SWING SOCIAL — Most Saturdays 9:00PM - 12AM $15"

A fixed weekly schedule at one venue is exactly the `sources/recurring/`
pattern (see AGENTS.md), so implemented as
`sources/recurring/salsa-con-todo.yaml` with 4 `schedules:` entries
(one file per venue, per the "one file, multiple schedules" rule) instead
of chasing the Wix Bookings widget's data. Tags `Dance`, `Fremont`
(registered neighborhood). Cover charges differ per social ($10 Mon/Thu,
$15 Fri/Sat) but `recurringEventSchema`'s `cost` field is a single flat
value applied to every schedule entry in the file — a per-entry cost
isn't representable structurally, so pricing is noted in the
`description` prose instead of a (misleading, if applied uniformly)
structured `cost` field. 4 events, 0 parse errors, verified via
`ONLY_SOURCE=salsa-con-todo npm run generate-calendars`; full `npm run
test` (3781 tests) and `npm run typecheck` both green.
