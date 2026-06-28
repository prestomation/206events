---
name: "Early Music Seattle"
status: proxy
platform: WordPress / Tribe Events ICS
url: https://earlymusicseattle.org/calendar/
tags: [Music, Arts]
firstSeen: 2026-05-21
lastChecked: 2026-06-28
---
Seattle's premier early music presenter, offering historical performances, world music festivals, and period ensembles from international artists. Runs three 4-day "Beyond Baroque" festivals per season plus showcase concerts and special events at Seattle-area venues.

Investigated 2026-05-21:
- WordPress site with Tribe Events plugin confirmed (`/?post_type=tribe_events&ical=1&eventDisplay=list`)
- Entire site blocked by SiteGround CAPTCHA (HTTP 202 `sg-captcha: challenge`) from Claude Code web environment
- Domain resolves and site is active (confirmed via search results and third-party listings)
- Cannot verify data shape — do not implement until accessible from this environment
- `geo: null` — multi-venue presenter (Chapel Performance Space, various Seattle halls)
- Tags: Music, Arts

Corrected 2026-05-21: Source was incorrectly added as `proxy: outofband` in PR #375 before confirming accessibility from Claude Code web. Removed `sources/external/early-music-seattle.yaml` in PR #376. Status set to `blocked` (SiteGround CAPTCHA blocks from both Claude Code web and CI). Re-investigate if SiteGround protection is removed or a direct ICS URL is found that bypasses the challenge.

Re-investigated 2026-06-28: SiteGround sgcaptcha is a JS challenge — qualifies for direct escalation to `proxy: "browserbase"` per AGENTS.md exception (no need to try outofband first when JS challenge is confirmed). Implemented as `sources/external/early-music-seattle.yaml` with `proxy: "browserbase"`. Status changed from `blocked` to `proxy`; CI will verify via Browserbase Fetch API. ICS data shape not yet confirmed (blocked from sandbox); expecting events from 2026–27 season (announced on their website).
