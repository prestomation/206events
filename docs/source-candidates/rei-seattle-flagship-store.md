---
name: "REI Seattle Flagship Store — Classes & Events"
status: blocked
platform: unknown (rei.com events platform)
url: https://www.rei.com/events/p/us-wa-seattle
tags: [Community]
firstSeen: 2026-07-05
lastChecked: 2026-09-23
pr:
---

REI's national "Classes & Events" listing filtered to the Seattle area
(`/events/p/us-wa-seattle`), which includes the Seattle flagship store
plus other Puget Sound-area REI locations under the same filter.

Investigated 2026-07-05: a WebFetch of the filtered listing returned
generic/non-Seattle-specific sample events, and a direct `curl` from
this environment failed to connect (no response), so the underlying
data format (JSON API vs. static HTML) could not be confirmed. Most
listed activities are paid, registration-required classes/courses
(gear clinics, avalanche safety, etc.) rather than free public
happenings, and the `us-wa-seattle` filter isn't scoped to the
flagship store alone — it would need per-store disambiguation to avoid
pulling in Bellevue/Redmond/Tukwila REI events. The underlying data
format is still unconfirmed, so leaving as `investigating` rather than
rejecting outright; next pass should try to find a real JSON endpoint
scoped to the flagship store before deciding viability.

**Re-checked 2026-09-23:** `https://www.rei.com/events/p/us-wa-seattle` still cannot be fetched from this environment (HTTP/2 stream reset, then a 25 s timeout with zero bytes over HTTP/1.1), which is consistent with REI's bot protection. No public feed or API found. Even if unblocked, the `us-wa-seattle` filter mixes in Bellevue/Redmond/Tukwila stores and most listings are paid registration courses, so this is low value. Closing as blocked.
