---
name: "Acorn Street Shop"
status: added
platform: Rain POS "events module" (server-rendered month-grid HTML)
url: https://www.acornstreet.com/module/events.htm?pageComponentId=1870456
tags: ["Workshops", "Ravenna"]
firstSeen: 2026-08-12
lastChecked: 2026-09-15
pr: 1483
---

Yarn shop at 2818 NE 55th St, Seattle (Ravenna/View Ridge), offering
knitting/crochet classes and events.

Investigated 2026-08-12:
- Site assets are served from `rainpos.com` (Rain Retail POS platform);
  no ICS, RSS, or public API found for the classes calendar
- Page returns static HTML but the actual class schedule appears to load
  via a Rain POS widget with no confirmed server-rendered date data in
  the fetched markup

**Re-investigated 2026-09-15:** the earlier check looked at the wrong
page (`/view-classes-calendar.htm`). Rain POS's own "events module" has a
separate, distinct month-grid endpoint —
`/module/events.htm?pageComponentId=1870456&year=<YYYY>&month=<numeric
1-12>` — that **does** server-render the full month's dated classes in
plain HTML (no JS needed): day number, time (single start time or an
explicit "H:MM to H:MM" range), and title, one `.calEvent` block per
occurrence. Confirmed live: 36 occurrences in September 2026, 33 of them
real public classes ("Knit Night!", "Beginning Knitting 101",
"Intermediate Knitting Project Class with Sue", "Introduction to
Portuguese...", "AIO Knits Pop-Up", etc) and 3 private one-on-one lesson
bookings ("Private Class with ...", "Classroom reserved for ...") that
the ripper filters out (those sometimes carry a real customer name and
are not public events). No admission price or per-event image in the
static HTML — left for the cost-resolver/photo-resolver gap queues
rather than guessed.

**Implemented 2026-09-15:** `sources/acorn_street_shop/` (`sourceRole:
venue`, `geo` resolved to OSM node 6736923413). Verified 91 events, 0
errors via `ONLY_SOURCE=acorn-street-shop npm run generate-calendars`.
