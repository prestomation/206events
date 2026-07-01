---
name: "Seattle Running Club"
status: added
platform: recurring YAML
url: https://www.seattlerunningclub.org/group-runs/
tags: [Running, "Central District"]
firstSeen: 2026-05-22
lastChecked: 2026-07-01
pr:
---

**Seattle Running Club** — `https://www.seattlerunningclub.org/group-runs/` — non-profit Puget Sound running club (est. 2005) offering training, competition, and community group runs.

Re-checked 2026-05-22 (`docs/discovery-log/2026-05-22.md`): flagged not viable — "events are internal club activities (skills practices, committee meetings), no public locations." No candidate file was actually committed at that time.

Re-investigated 2026-07-01: the group-runs page describes several weekly runs. Most have rotating or variable locations, unsuitable for a single-location recurring entry:
- **Wednesday workout** (6:30 PM) — rotating locations (Garfield HS track, hills, Lake Washington, Chief Sealth trail Jan–Aug; cross country various spots Sep–Dec)
- **Sunday trail run** (8:00 AM) — rotates through Cougar/Tiger/Squak Mountain trailheads by week-of-month, with 4th/5th Sundays "varies — anywhere"

However, the **Thursday social run** is a fixed weekly public event: "6:00 PM, east side of the Garfield Community Center near the parking lot... We meet in this location every week." Open to the public (not members-only), fits the recurring YAML pattern.

- Location: Garfield Community Center, 2323 E Cherry St, Seattle, WA 98122 (Central District)
- OSM: way 228779140, confirmed via Nominatim
- Distance ~6.2 mi (winter) / ~6.5 mi (summer) with shorter ~4.5–4.7 mi options
- Implemented as `sources/recurring/seattle-running-club-thursday-social-run.yaml`

Note: Flying Lion Brewing (`sources/flying_lion_brewing/`) already covers a *different* Monday run co-sponsored by SRC out of the brewery in Columbia City — no overlap with this Thursday run at Garfield Community Center.
