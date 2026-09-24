---
name: City of Shoreline
status: blocked
platform: unknown (site inaccessible)
url: https://www.shorelinewa.gov/our-city/events-meetings/calendar
tags: [Community, Shoreline]
firstSeen: 2026-09-24
lastChecked: 2026-09-24
pr:
---

City of Shoreline events calendar. The whole `shorelinewa.gov` domain
returns HTTP 403 "Access Denied" (WAF block, not a missing page) from
this environment, including the bare homepage — this isn't a CI-only
block that the outofband/browserbase proxy ladder would fix, it's
inaccessible from here entirely. Per the source-discovery skill: a
source that can't be fetched from anywhere has nothing to prove, so
this isn't staged for proxy testing. Re-check from a different network
context if this comes up again.
