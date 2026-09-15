---
name: Private Class with Tyler
status: added
platform: Rain POS "events module" (server-rendered month-grid HTML)
url: https://www.acornstreet.com/module/events.htm?pageComponentId=1870456&year=2026&month=Aug&day=25&eventId=4560848
tags: ["creation", "learning", "cozy"]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
pr: 1483
---

Discovered via aggregator gap analysis. 7 events in the Seattle
metro sample. Source domain: acornstreet.com.

Sample event: "Private Class with Tyler" (2026-08-26T00:00:00.000Z)
Description: Private one-on-one knitting class with Tyler at Acorn Street Shop.

Same domain/venue as `docs/source-candidates/acorn-street-shop.md`
(now `status: added`) — the sample event that surfaced this candidate
is itself exactly the kind of private one-on-one booking the
implemented ripper deliberately filters out (`isPrivateBooking()`
skips any "Private ..."/"... reserved for ..." title, since these
sometimes carry a real customer's name and are not public events). The
33 genuinely public classes/month at this venue are covered by
`sources/acorn_street_shop/`.
