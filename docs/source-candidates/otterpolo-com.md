---
name: "Seattle Otters Water Polo"
status: added
platform: recurring YAML (Wix site, no API/feed)
url: https://www.otterpolo.com/practices
tags: [Sports]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
pr:
---

Discovered via aggregator gap analysis. Seattle Otters is a masters
(adult recreational) water polo club with public drop-in practice
scrimmages, open to anyone with prior high-school or club-level
water polo experience who holds current USA Water Polo registration.

Investigated 2026-09-15:
- Site is Wix; `/practices` is server-rendered with two named seasons:
  - **Lake session** (already ended for 2026): "Mondays 6:30-sunset pm,
    June 29th through August 31st" at Green Lake — no fixed end time
    (sunset varies through the summer), so not implementable without
    guessing a duration.
  - **2026 Fall Session** (currently live): "Tuesdays and Thursdays
    8-9:30pm, September 8th - December 17th" at Medgar Evers Pool,
    500 23rd Ave, Seattle, WA 98122 (with two skipped dates, 9/24 and
    12/10, that the recurring-schedule engine has no way to exclude).
    $17/practice drop-in fee, or a 10-practice punch card.
- Confirmed venue via Nominatim: "Medgar Evers Pool" (osm way
  52201947, leisure/sports_centre) at the stated address —
  47.6065326, -122.3023574.

**Implemented 2026-09-15:** added
`sources/recurring/seattle-otters-water-polo.yaml` covering only the
fixed-time Fall Session (Tue/Thu 8-9:30pm, months Sept-Dec) — the
Green Lake summer session was left out since its "until sunset" end
time can't be encoded as a fixed duration without guessing. Verified
via a local `ONLY_SOURCE` build: 2 events (next Tue/Thu occurrences),
0 errors.
