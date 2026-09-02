---
name: Chihuly Garden and Glass Events
status: added
pr: 1335
platform: Custom HTML
url: https://www.chihulygardenandglass.com/events
tags: [Cultural, Seattle Center]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
---

Chihuly Garden and Glass exhibition at Seattle Center hosting special events and programs.

**Checked 2026-08-14:** Confirmed live, Seattle Center venue. Simple
list-style events page (no identifiable calendar platform, no
Squarespace/WordPress markers, no ICS). Low volume: 3 events found
("Dancing in the Glasshouse" Aug 2026, "Canvas & Cocktails" Aug 30,
"GATHER" REFRACT opening party Oct 15) — per the volume guidance, low
volume alone isn't disqualifying. Would need a plain HTML scrape.

**Implemented 2026-09-02 (PR #1335):** the listing page only advertises a
title + month range per program; actual occurrence dates/times live on
each program's own detail page (parsed via a custom `IRipper`). Past
occurrences are struck through (`<s>`) by the site itself rather than
removed — used as the future-only filter. Verified live: 17 upcoming
events across 7 programs at implementation time.
