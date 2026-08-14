---
name: King County Library System Events
status: candidate
platform: BiblioCommons
url: https://kcls.bibliocommons.com/v2/events
tags: [Learning, Family]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
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
