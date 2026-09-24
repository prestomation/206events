---
name: "Discover Burien"
status: investigating
platform: Squarespace (calendarView collection)
url: https://www.discoverburien.org/calendar
tags: [Community, Burien]
firstSeen: 2026-09-24
lastChecked: 2026-09-24
---

Burien community/tourism calendar site (`discoverburien.org`), King County.

Investigated 2026-09-24:
- Squarespace confirmed
- `/calendar?format=json` returns `calendarView: true` and a `monthFilter`
  timestamp (defaults to the current month) instead of the usual
  `upcoming`/`past` split — `items: 12` mixes past and future dates within
  that one month (e.g. "B-Town Fiesta" Sep 27 2026, "Burien Farmer's Market"
  Sep 24 2026, "Pride Movie Night" Sep 18 2026, already past)
- The built-in `squarespace` ripper type (`lib/config/squarespace.ts`) only
  reads `upcoming`/`past`/`items` with pagination via `pagination.nextPageUrl`
  — it has no handling for `calendarView`/`monthFilter` collections, so
  pointing the built-in ripper at this URL as-is would need either a
  month-by-month crawl (`?month=<ts>`) or a custom ripper to walk forward
  through months and filter by date
- Not implementable with the existing built-in ripper without that added
  support; not a dead end, just needs either an enhancement to the
  built-in squarespace type (calendarView support) or a small custom
  ripper. Re-evaluate as a 🔴 Low custom-scraper candidate in a future cycle.
