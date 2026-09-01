---
name: "SeattleArtists.com"
status: notviable
platform: Next.js SPA with JSON API (Supabase-backed)
url: https://www.seattleartists.com/calendar
tags: [Art]
firstSeen: 2026-09-01
lastChecked: 2026-09-01
pr:
---

Community art-events calendar run by SeattleArtists.com ("The Original
Seattle Art Network & Marketplace for Independent Artists"). The
`/calendar` page itself is a client-rendered Next.js app with no data in
the static HTML, but it calls a real JSON API at
`https://www.seattleartists.com/api/events` that returns structured event
data: `title`, `description`, `startDate`/`endDate` (ISO 8601 UTC),
`registrationUrl`, `imageUrl`, `venueId`, `cost`.

Investigated 2026-09-01: fetched the API directly (46 total entries, 5
with `startDate` in the future at check time). Despite the "Seattle"
branding, the venue geography is **Puget Sound-wide, not Seattle-focused**:
sampled events include Gallery North (Edmonds), Parklane Gallery
(Kirkland), a Vashon Island studio tour, a Renton studio tour, Maple
Valley Days Arts Festival, and BIMA (Bainbridge Island Museum of Art)
block party/programming — alongside genuinely Seattle venues (Ballard,
Freehold Theatre, Native Action Network). Roughly half of the sampled
events are outside Seattle city limits, which fails the source-discovery
quality gate ("must be Seattle-focused — primarily serving Seattle
audiences... venues entirely outside Seattle are not appropriate", and
this source's individual events span many such venues, not just a couple
of outliers).

Marking `notviable` on geography, not on data quality — the API itself is
clean and would be trivial to parse (`JSONRipper` candidate) if the venue
mix were Seattle-only. Worth a second look if the org narrows scope, or if
a way to filter the API by venue city surfaces.
