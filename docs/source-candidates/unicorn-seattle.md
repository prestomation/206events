---
name: "Unicorn"
status: added
pr: 782
platform: recurring YAML (Squarespace events collection unpopulated)
url: https://www.unicornseattle.com/events
tags: [Nightlife, Trivia, "Pub Trivia", "Capitol Hill"]
firstSeen: 2026-06-30
lastChecked: 2026-09-12
---

**Unicorn** — `https://www.unicornseattle.com/events` — carnival-themed bar and lounge at 1118 E Pike St, Capitol Hill (sister venue to Queer/Bar and Le Faux/Julia's on Broadway, already covered).

Investigated 2026-06-30:
- Squarespace site confirmed, but the `/events?format=json` collection (`itemCount: 0`, `typeName: "page"`) is not a real Squarespace events collection — no machine-readable upcoming-events feed.
- Raw page HTML, however, shows a stable weekly recurring schedule across many consecutive weeks (May–June 2026), each occurrence individually dated with consistent times:
  - Karaoke — every Monday, 9:00 PM – 1:00 AM
  - Drag Queen Bingo — every Tuesday, 8:00 PM – 11:00 PM
  - Trivia (Geeks Who Drink) — every Thursday, 7:30 PM – 9:30 PM
  - Lashes Cabaret (drag show, no cover) — every Friday, 7:30 PM – 9:00 PM
  - (Also "Werk Wednesdays" — a themed weekly Wednesday show with a different name/start time each week; too variable to encode as a single recurring entry, left uncovered)
- OSM node confirmed: `Unicorn Bar`, node 1387947219, lat 47.6142340 lng -122.3172456, website matches.
- Implemented as four separate `sources/recurring/unicorn-seattle-*.yaml` files (one per named event), all sharing the same venue geo — same pattern as the existing `le-faux-*` (Julia's on Broadway) multi-event venue.
- All 4 calendars verified to produce 1 future event each via `ONLY_SOURCE=unicorn-seattle-karaoke,unicorn-seattle-drag-bingo,unicorn-seattle-trivia,unicorn-seattle-lashes-drag-show npm run generate-calendars`.

Re-checked 2026-09-12:
- The `/events?format=json` collection is no longer empty — it's now a
  real Squarespace events collection with 10 upcoming items (through
  late Sept 2026): Karaoke (Mon 9pm), Drag Queen Bingo (Tue 8pm), Trivia —
  Geeks Who Drink (Thu 7:30pm), and Lashes Cabaret (Fri 7:30pm), plus a
  one-off "Afterparty Part 2".
- Every recurring occurrence in the live feed matches the day/time already
  encoded in the 4 `sources/recurring/unicorn-seattle-*.yaml` files
  1:1 — no drift. Left as-is: the recurring-YAML approach is simpler than
  switching to a `SquarespaceRipper` subclass for no behavioral gain, and
  still doesn't cover the variable-named "Werk Wednesdays" show (still no
  Wednesday item in the current `upcoming` feed either). No action needed.
