---
name: "Peddler Brewing"
status: notviable
platform: WordPress (broken)
url: https://www.peddlerbrewing.com
tags: [Beer, Fremont]
firstSeen: 2026-06-25
lastChecked: 2026-06-25
---

Fremont/Ballard-area brewery with regular events (Pun Slam comedy nights, movie nights, board game nights).

Investigated 2026-06-25:
- WordPress site (confirmed by wp-content/ paths)
- `/events/` page exists but is a sparse stub with broken links to `/calendar` and `/movies` (both 404)
- Tribe Events ICS endpoint returns homepage HTML — plugin not installed
- WordPress REST API returns SEO spam (site appears compromised)
- No ICS feed, no calendar widget, no Eventbrite/DICE account found
- Events are announced ad-hoc on Facebook/Instagram; no machine-readable source

**Verdict**: Not viable — no structured calendar feed. WordPress install appears compromised with spam content injection.
