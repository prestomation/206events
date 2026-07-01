---
name: "Southwest Seattle Historical Society - Log House Museum"
status: notviable
platform: WordPress (no events plugin)
url: https://loghousemuseum.org/events/
tags: [Community, History]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

West Seattle history museum and historical society at Alki. Hosts walking tours, storytimes, and community talks.

Investigated 2026-07-01:
- WordPress site (no Cloudflare); `/wp-json/wp/v2/types` shows only standard post types — no `tribe_events` post type, no The Events Calendar plugin
- `/events/` page currently renders 0 events — museum is "temporarily closed for a permanent exhibit installation"
- Individual events (walking tours, storytime) appear to be published as regular blog posts, not a structured events collection — would require custom HTML scraping of the blog with no reliable machine-readable date field
- Not viable today; re-evaluate if the museum adopts a real events platform or the `/events/` page starts listing structured content
