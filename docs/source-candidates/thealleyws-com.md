---
name: The Alley (West Seattle) — Resident Jazz Nights
status: added
platform: Custom HTML (static resident-bands page, no ripper needed)
url: https://thealleyws.com/resident-bands
tags: ["Music", "West Seattle"]
firstSeen: 2026-08-25
lastChecked: 2026-09-10
pr: 1432
---

Discovered via aggregator gap analysis. 5 events in the Seattle
metro sample. Source domain: thealleyws.com.

Original sample event: "The Triangular Jazztet - Sunday Night Jazz"
(2026-08-25T03:00:00.000Z).

**Implemented 2026-09-10:** Re-checked the live page
(`thealleyws.com/resident-bands`) and the resident-band lineup has since
changed — the current bands are **DLux Jazz Trio** (Sunday 8-10pm) and
**The Westside Jazz Trio** (Monday 8-10pm), not the Triangular Jazztet
from the original sample. Both are free, no-cover weekly shows, listed
as plain static text (no dates, no structured data, no calendar
platform) — a fixed weekly house-band schedule rather than a scraped
per-event calendar, so implemented as two `sources/recurring/` entries
instead of a custom ripper:
- `sources/recurring/the-alley-dlux-jazz-trio.yaml`
- `sources/recurring/the-alley-westside-jazz-trio.yaml`

Venue: The Alley, 4509 California Ave SW, Seattle, WA 98116 (Alaska
Junction, West Seattle). Coordinates from OSM node 5829964363 ("The
Alley" bar at this address). PR #1432.
