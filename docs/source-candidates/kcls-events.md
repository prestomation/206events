---
name: King County Library System Events
status: added
platform: BiblioCommons
url: https://kcls.bibliocommons.com/v2/events
tags: [Learning, Family]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
---

King County Library System events including author talks, classes, and community programs at branch libraries.

Verified 2026-08-14: live site, **BiblioCommons** platform ("Powered by
BiblioCommons" footer), showing "1 to 20 of 4,021 items" — very high
volume across ~50 KCLS branches. Sample events: Weydii Ambassador
Sabtida (Tukwila), Talk Time English Conversation (Richmond Beach), Baby
Storytime (Federal Way 320th), StoryWalk (Judd Creek Loop). No ICS/iCal
export or documented JSON API found in page source; the SPA is React-
rendered and `/v2/events.json` returns the HTML shell, not JSON — would
need either an XHR-endpoint investigation (BiblioCommons SPAs often have
an internal `/v2/events?ld=...` or similar data endpoint reachable by
browser automation) or HTML scraping. Distinct from the already-covered
`sources/spl` (Seattle Public Library only) — KCLS is the separate,
larger suburban/regional system (Bellevue, Redmond, Renton, etc.), so
not a duplicate. Given the volume, likely worth a per-branch or a single
combined ripper; flag scope (all branches vs. Seattle-adjacent branches
only) for implementation-time judgment.

**Closed 2026-09-23 (notviable):** King County Library System serves suburban/unincorporated King County only (Bellevue, Redmond, Renton, Tukwila, Shoreline, Federal Way, etc.); it has no branches inside Seattle city limits. Seattle is served by SPL, already covered by `sources/spl`. Fails the Seattle-focused gate: outside Seattle.

**Re-opened 2026-09-23 (King County rule; added):** KCLS branches are all in King County, so this is now in bounds. Added `sources/kcls/` (source `kcls`, custom `IRipper`, `sourceRole: venue`, `cost: free`, `lookahead: P4W`). It reads the public BiblioCommons gateway API `gateway.bibliocommons.com/v2/libraries/kcls/events?sort=definition.start asc&cancelled=false&limit=100&page=N`. That API ignores date filters, so the ripper pages through the start-sorted list until it passes the lookahead (about 16 requests). There is one calendar per branch (45 branch calendars, routed by `branchLocationId`, each with branch geo and a city tag), plus a catch-all `other-locations` calendar (`geo: null`) for non-branch places and minor branches. Online-only events, and multi-week programs that started before today, are skipped. All-day (date-only) events are handled. Verified with `ONLY_SOURCE=kcls`: about 1,500 events across 46 calendars, every calendar at least 5, 0 parse errors. Note: it adds about 2.3 MB to `events-index.json` (production is about 18 MB).

2026-09-23 (review follow-up): lookahead is P4W (about 1,500 events, 16 requests, about +1.3 MB to events-index.json). Added a Greenbridge branch calendar (White Center). Removed `expectEmpty` from all calendars, because every one has events.
