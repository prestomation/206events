---
name: "FareStart Seattle"
status: notviable
platform: Custom WordPress (no Tribe Events, REST API 404)
url: https://www.farestart.org/events/
tags: [Food, Community, South Lake Union]
firstSeen: 2026-06-13
lastChecked: 2026-06-13
---

FareStart is a Seattle 501(c)(3) nonprofit that provides job training and food security programs. Their primary events are bi-weekly "Guest Chef Night" dinners (local celebrity chef × FareStart students, ticketed at $50+) and an annual gala in October.

Investigated 2026-06-13:
- 9 upcoming events confirmed on website
- Platform: Custom WordPress; Tribe Events ICS URL (`?post_type=tribe_events&ical=1`) returns HTML, not ICS
- WordPress REST API (`/wp-json/wp/v2/events`) returns 404
- Tribe Events REST API (`/wp-json/tribe/events/v1/events`) returns 404
- Event URLs follow pattern `/events/guest-chef-night-<date>/`
- No accessible standard API or ICS feed; would require custom HTML scraper

**Not added** — custom scraper needed. Revisit if they add a standard calendar export.
