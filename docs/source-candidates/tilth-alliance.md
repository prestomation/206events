---
name: "Tilth Alliance"
status: added
platform: WordPress / Tribe Events ICS
url: https://tilthalliance.org/events/
tags: [Community, Education]
firstSeen: 2026-06-14
lastChecked: 2026-06-14
---
Seattle-based urban agriculture nonprofit headquartered at Good Shepherd Center (4649 Sunnyside Ave N) with a second location at Rainier Beach Urban Farm and Wetlands (5513 S Cloverdale St).

Investigated 2026-06-14:
- WordPress site with The Events Calendar (Tribe Events) plugin
- ICS URL: `https://tilthalliance.org/?post_type=tribe_events&ical=1&eventDisplay=list`
- HTTP 200, `text/calendar` — accessible from Claude Code sandbox (Cloudflare, no CAPTCHA)
- 30 upcoming events: garden classes, urban farming workshops, youth summer camps, culinary dinners, farm walks
- Primary venues: Good Shepherd Center (Wallingford) and Rainier Beach Urban Farm (Rainier Beach)
- Some events at out-of-area farms (e.g., Tonasket, WA) — acceptable as occasional field trips; org is Seattle-focused
- `geo: null` — multi-venue presenter

Added as `sources/external/tilth-alliance.yaml`.
