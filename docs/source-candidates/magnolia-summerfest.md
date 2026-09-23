---
name: "Magnolia Summerfest"
status: added
platform: Recurring (annual, multi-day)
url: https://www.magnoliasummerfest.org/
tags: [Community, Magnolia, Festival]
firstSeen: 2026-07-30
lastChecked: 2026-09-23
pr:
---

Discovered via r/SeattleEvents post: https://old.reddit.com/r/SeattleEvents/comments/1v91pu5/magnolia_summerfest_73182_free_admission_no_dogs/
Post title: "Magnolia Summerfest 7/31-8/2 (Free admission- no dogs and no personal tents allowed this year)"
Post date: 2026-07-28

Annual free community festival in the Magnolia neighborhood, presented by
the Magnolia Chamber of Commerce. 2026 edition: July 31 – August 2 at
Magnolia Playfield (W Smith St & 33rd Ave W). Includes a parade, live
music, art & craft vendors, food trucks, and family activities.

Investigated 2026-07-30:
- Website is Squarespace (magnoliasummerfest.org), schedule page has no
  structured event data — just a placeholder "This block has no content yet"
- Three-day annual event (Fri-Sun pattern, late July / early August)
- 15th+ year running (presented by Magnolia Chamber of Commerce, a 501(c)6)
- Same shape as other annual festivals tracked as `sources/recurring/` YAML
  entries (e.g. lake-city-summer-festival-parade, beacon-hill-festival)
- No ICS feed or JSON API; best fit is a hand-authored recurring YAML entry
- Needs one more year of history to confirm the annual date pattern (late
  July / early August weekend) before committing to an RRULE

**Re-checked 2026-09-23 (added):** Added `sources/recurring/magnolia-summerfest.yaml`. magnoliasummerfest.org now publishes the 2027 dates (Aug 6-8), which confirms the pattern: the Fri-Sun weekend of the 1st Saturday of August (2024 Aug 2-4, 2025 Aug 1-3, 2026 Jul 31-Aug 2). Only the Saturday is modeled (`1st Saturday`, months [8], 10:00 parade start, PT12H with the main stage running until 10pm per the 2026 schedule), because the recurring grammar can't express the Friday before or the Sunday after the 1st Saturday. The description mentions the full weekend. Location is West Magnolia Playfield (OSM relation 4777933). `ONLY_SOURCE=magnolia-summerfest` gives 1 event (RRULE, next occurrence 2027-08-07) with 0 errors.
