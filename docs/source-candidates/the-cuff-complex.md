---
name: "The Cuff Complex"
status: candidate
platform: Squarespace
url: https://www.cuffcomplex.com/events
tags: ["Nightlife", "Capitol Hill"]
firstSeen: 2026-07-16
lastChecked: 2026-07-16
---

Capitol Hill leather bar/nightclub at 1533 13th Ave, four bars and a
large deck, 21+. Regular weekly programming includes Hump Day Karaoke
(Wed), Thotty Thursday, Friday Night Fever, and Fluffy Cuff Karaoke
(Sun). Annual Cuff Pride Fest is the signature event (last weekend of
June).

Investigated 2026-07-16:
- Confirmed Squarespace via response headers and page structure
  (`calendarView` page type, same as other Squarespace Events pages in
  the repo).
- `?format=json` on `/events` returns a well-formed Events collection
  response (`upcoming`/`past` arrays present), but `upcoming` is empty
  at time of check — 0 events.

**Verdict**: Per skill rule ("200 + 0 events" → keep as candidate, not
implement). Re-check next cycle; if `upcoming` has entries the
built-in `squarespace` ripper type should work directly.
