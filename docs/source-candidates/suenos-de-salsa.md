---
name: "Sueños de Salsa"
status: added
platform: Custom HTML (WordPress, recurring weekly schedule)
url: https://suenosdesalsa.com/socials-and-practicas/
tags: [Dance, "Roosevelt"]
firstSeen: 2026-08-12
lastChecked: 2026-08-13
pr: 1189
---

Salsa/bachata dance studio at 6512 Roosevelt Way NE, Seattle, WA 98115
(Roosevelt neighborhood), established 2011. Offers group classes, private
lessons, workshops, and a performance team.

Investigated 2026-08-12:
- WordPress site (`wp-json` link header present)
- `/socials-and-practicas/` page advertises a recurring weekly social:
  every Wednesday, 8:45 pm, $10 online / $15 at door (50% off for studio
  students)
- No ICS/Tribe Events/Eventbrite calendar found — just static WordPress
  page content
- Single, well-defined weekly recurring event — good fit for
  `sources/recurring/<name>.yaml` (`schedule: every Wednesday`,
  `start_time: "20:45"`) rather than a custom ripper, similar to the
  trivia-night recurring entries
- Not yet geocoded; address above needs Nominatim verification before
  implementation

Implemented 2026-08-13 as `sources/recurring/suenos-de-salsa.yaml` (PR #1189):
geocoded via Nominatim (47.6762994, -122.3172087), `cost: 10` (cheaper online
price), duration estimated at `PT3H` (no end time published — flagged for
calendar-verification). Also registered "Roosevelt" as a new neighborhood tag
in `city.config.ts`.
