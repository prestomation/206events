---
name: "Hierophant Meadery"
status: notviable
platform: "WordPress / The Events Calendar (Tribe Events)"
url: https://hierophantmeadery.com/events/
tags: []
firstSeen: 2026-08-08
lastChecked: 2026-08-08
pr:
---
Investigated 2026-08-08: confirmed a working Tribe Events ICS feed at
`https://hierophantmeadery.com/events/?ical=1` (also a REST endpoint at
`/wp-json/tribe/events/v1/events`) — technically a 🔥 high-confidence,
zero-code ICS integration. But the feed's own hosted events (as opposed to
farmers-market pop-up appearances mentioned on the site) are anchored at
their home address, 5586 Double Bluff Rd, Freeland, WA 98249 — Whidbey
Island, not Seattle. Of the 3 events currently in the feed, the one with a
location is in Freeland; the site's broader "events" page also lists
recurring appearances at Seattle-area farmers markets (Pike Place, Ballard)
but those aren't distinct dated entries in this feed — they're pouring at
markets we may already cover via the market sources themselves.

Not Seattle-focused per the quality gate: the venue and its own hosted
events are based outside Seattle. Re-evaluate if they open a Seattle
tasting room or the ICS feed starts carrying dated Seattle market
appearances directly.
