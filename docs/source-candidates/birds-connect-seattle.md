---
name: "Birds Connect Seattle"
status: notviable
platform: WordPress
url: https://www.birdsconnectsea.org/calendar/
tags: [Community]
firstSeen: 2026-06-18
lastChecked: 2026-06-18
---
Seattle-based birding and bird conservation organization. Hosts field trips, neighborhood bird outings, and accessibility-focused events.

Investigated 2026-06-18:
- WordPress confirmed (`/wp-content/uploads/` image paths)
- Tribe Events ICS endpoint (`/?post_type=tribe_events&ical=1&eventDisplay=list`) returns HTML, not ICS — plugin not installed or not The Events Calendar
- No accessible machine-readable calendar feed found
- Would require custom HTML scraper against a JavaScript-rendered calendar
