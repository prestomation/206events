---
name: "Raygun Lounge"
status: notviable
platform: WordPress
url: https://www.raygunlounge.com/calendar/
tags: []
firstSeen: 2026-07-16
lastChecked: 2026-07-16
---

Capitol Hill divebar/arcade/gamestore at 501 E Pine St. Hosts a
monthly "Drink, Draw & Pinball" night (1st Wednesday) plus occasional
one-offs.

Investigated 2026-07-16:
- WordPress site, but no Tribe Events / The Events Calendar plugin
  (`/wp-json/tribe/...` doesn't exist) and no custom "event" post type
  in `/wp-json/wp/v2/types` (just standard Posts/Pages).
- `/calendar/` page renders (200), but content is client-rendered with
  no server-side event data, ICS, or schema.org `Event` markup found in
  the static HTML.
- `/events/` 404s.

**Verdict**: Not viable — no structured/machine-readable event data
found; would require fragile custom scraping of a page with sparse,
largely undated content. Re-evaluate if the venue adopts a calendar
plugin or ticketing platform.
