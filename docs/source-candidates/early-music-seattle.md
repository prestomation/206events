---
name: "Early Music Seattle"
status: proxy
platform: WordPress / Tribe Events ICS
url: https://earlymusicseattle.org/calendar/
tags: [Music, Arts]
firstSeen: 2026-05-21
lastChecked: 2026-05-21
---
Seattle's premier early music presenter, offering historical performances, world music festivals, and period ensembles from international artists. Runs three 4-day "Beyond Baroque" festivals per season plus showcase concerts and special events at Seattle-area venues.

Investigated 2026-05-21:
- WordPress site with Tribe Events plugin confirmed (`/?post_type=tribe_events&ical=1&eventDisplay=list`)
- Entire site blocked by SiteGround CAPTCHA (HTTP 202 `sg-captcha: challenge`) from sandbox and CI runner IPs
- Domain resolves and site is active (confirmed via search results and third-party listings)
- Implement with `proxy: "outofband"` — residential IP bypasses SiteGround bot protection (same pattern as SeattleDances)
- `geo: null` — multi-venue presenter (Chapel Performance Space, various Seattle halls)
- Tags: Music, Arts

Implemented 2026-05-21: `sources/external/early-music-seattle.yaml` with `proxy: outofband`.
