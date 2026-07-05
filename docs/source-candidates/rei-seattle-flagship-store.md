---
name: "REI Seattle Flagship Store — Classes & Events"
status: investigating
platform: unknown (rei.com events platform)
url: https://www.rei.com/events/p/us-wa-seattle
tags: [Community]
firstSeen: 2026-07-05
lastChecked: 2026-07-05
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
