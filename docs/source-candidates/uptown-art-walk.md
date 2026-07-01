---
name: "Uptown Art Walk"
status: candidate
platform: "Recurring (no feed/API — hand-coded schedule)"
url: https://www.uptownartwalk.com/
tags: [Artwalk, Uptown]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
pr:
---

**Uptown Art Walk** — free, self-guided monthly art walk in the Uptown /
Lower Queen Anne neighborhood, hosted by a rotating group of local
merchants and galleries (e.g. A/NT Gallery, The Fishbowl, Far Eats Cafe).
Not currently covered by any existing source — `sources/recurring/` has
art walks for Ballard, Belltown, Capitol Hill, Central District,
Chinatown-ID, Downtown, Fremont, Georgetown, Lake City,
Phinney/Greenwood, Pike Place, Pioneer Square, Rat City, U-District,
Wallingford, and West Seattle, but no Uptown entry. "Uptown" is already a
registered neighborhood in `city.config.ts`.

Investigated 2026-07-01:
- Confirmed live and current via `www.uptownartwalk.com` ("third
  THURSDAYs SEATTLE, WA | 5-8 PM") and the `@uptownartwalkseattle`
  Instagram bio ("Third Thursdays 5-8 pm ... Free. All ages.")
- Schedule: **3rd Thursday of every month, 5:00–8:00 PM** — matches the
  `RipperCalendar` recurring-YAML pattern used by every other art walk in
  the repo (single `schedule:` entry, no per-event dates published)
- No ICS/API — same as the other hand-coded art walks, this is a
  `sources/recurring/uptown-artwalk.yaml` candidate, not a ripper
- The older `uptownartwalkseattle.wordpress.com` site is stale (last blog
  post 2015) and should **not** be used as the URL; the active site is
  `uptownartwalk.com`
- Suggested geo: centroid of Uptown neighborhood, ~lat 47.6238, lng
  -122.3568 (near 2nd Ave W / Republican St, matching The Fishbowl's
  geocoded location at lat 47.6231677, lng -122.3591802)
- Tags: `Artwalk`, `Uptown`
