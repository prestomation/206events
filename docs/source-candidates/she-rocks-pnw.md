---
name: "She Rocks (PNW climbing community)"
status: added
platform: "Squarespace page (HTML scrape of /gym-night-dates)"
url: https://www.sherocks-pnw.org/
tags: [Sports]
firstSeen: 2026-08-15
lastChecked: 2026-09-23
pr: 1571
---

Seattle-area community of climbers making the sport more accessible to women
and non-binary climbers. Hosts monthly "gym nights" rotating across the same
climbing gyms already tracked elsewhere in this repo (Edgeworks — 3rd
Thursday of each month per this page, Vertical World locations, Uplift
Climbing, Momentum Bouldering) plus occasional outdoor climbs.

Investigated 2026-08-15:
- No calendar page, ICS feed, or Meetup group found on the site itself.
- The page states members should check Instagram (`@sherockspnw`) for "the
  most up-to-date information" on gym-night dates/times — this is an
  Instagram-only schedule, not a dated web calendar.
- Would need `skills/instagram-source/SKILL.md` (read flyer/caption via
  vision, write to `instagram-cache.json`) rather than a standard ripper —
  same shape as other `type: instagram` sources already in the repo.
- Low volume/consistency risk: dates described as "typically around 5:30 -
  7ish PM" (approximate), and gym nights piggyback on host gyms already
  independently tracked as candidates (`edgeworks-climbing.md` — notviable,
  blocked; `momentum-climbing-sodo.md` — notviable, JS-rendered), so there's
  real overlap risk with those venues' own events if either ever becomes
  scrapable.

Left as `investigating` rather than `candidate` — worth a follow-up look at
the Instagram feed's actual posting cadence before committing to the
instagram-source pipeline for it.

2026-09-23: Found a structured schedule on the Squarespace page `/gym-night-dates` (per-gym sections with address, time range and a "2026 Dates:" m/d list). Added custom HTMLRipper `sources/she_rocks_pnw/` (source `she-rocks-pnw`, calendar `gym-nights`), emitting only the Seattle host gyms (Edgeworks Seattle, Vertical World Seattle, Half Moon Bouldering, Momentum SODO); Lynnwood/Shoreline gyms are filtered out. 48 events for 2026 (about 12 upcoming), 0 errors.
