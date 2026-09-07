---
name: Georgetown Coalition Recurring Events
status: notviable
platform: Drupal
url: https://georgetowncoalition.org/recurring-events
tags: [Community, Georgetown]
firstSeen: 2026-08-14
lastChecked: 2026-09-05
---

Georgetown neighborhood community coalition hosting recurring events and neighborhood gatherings.

Verified 2026-08-14: live page, **Drupal** (Bootstrap Business theme,
`block-bootstrap-business` markers). Lists year-round recurring events
(Art Attack — 2nd Saturday; Farmers Market — Thursdays 3-7pm, May-Sept,
6601 Carleton Ave S) plus a seasonal annual-events list (Georgetown
Bites, Honk! Fest West, Carnival & Side Show, Garden Walk, Pride, GS8
Film Festival, Halloween Parade, Haunted History Tour, etc). Good fit for
`sources/recurring/` (fixed weekly/monthly schedule) with the seasonal
one-offs handled separately or noted as caveats.

**Re-checked 2026-09-05:** both recurring events on this page are already
covered. `sources/recurring/georgetown-artwalk.yaml` covers "Art Attack"
(2nd Saturday, matches this page's "held every second Saturday"), and
`sources/recurring/georgetown-farmers-market.yaml` covers "Farmers
Market" (Thursdays 3-7pm, 6601 Carleton Ave S, matching exactly). The
seasonal one-off annual events listed here (Georgetown Bites, Honk! Fest
West, Carnival & Side Show, Garden Walk, Pride, GS8 Film Festival,
Halloween Parade, Haunted History Tour, Spooky Stroll, Equinox Open
Studios) are also already separately covered where dated
(`sources/recurring/honk-fest-west.yaml`,
`sources/recurring/georgetown-carnival.yaml`) or don't carry a scrapable
date on this page. Nothing left to add from this specific page; marking
`notviable` rather than `candidate` so it isn't re-proposed.
