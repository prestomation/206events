---
name: A Cleaner Alki
status: added
platform: Squarespace
url: https://www.byandby.org/events
tags: ["Community", "West Seattle"]
firstSeen: 2026-08-14
lastChecked: 2026-08-25
pr: TBD
---

Seattle community gathering space hosting events, meetings, and social activities.

**Checked 2026-08-14:** Note: the domain now resolves to **"A Cleaner
Alki"** (`<title>A Cleaner Alki</title>`, og:site_name "A Cleaner Alki")
— a West Seattle beach-cleanup/community-stewardship group fiscally
sponsored by the Seattle Parks Foundation, not whatever "By and By"
originally was. The candidate's name/description are stale but the
underlying org is real, live, and Seattle-focused (West Seattle).
Squarespace-hosted with a real `/events` calendar: confirmed dated
events (Schmitz Park restoration Aug 14, Little Saigon cleanup Aug 15,
Lafayette Elementary cleanup Aug 16 2026). Decent recurring volume
(weekly). Recommend renaming/re-describing this candidate to "A Cleaner
Alki" if implemented.

**Implemented 2026-08-25:** Added as `sources/a_cleaner_alki/ripper.yaml`
(built-in `squarespace` type, `sourceRole: venue`, `geo: null` since
cleanups rotate across different West Seattle parks each week —
per-event geocoding via `location`). Verified via
`ONLY_SOURCE=a-cleaner-alki` build: 5 upcoming events, 0 errors, all
5 locations geocoded successfully within Seattle city limits. Tagged
`Community`, `West Seattle`. `cost: free` (volunteer cleanup events,
no ticketing). No `imageUrl` set at the ripper level — per-event
images are already present from Squarespace and flow through
normally.
