---
name: Elysian Brewing
status: added
platform: Custom HTML (Drupal 10)
url: https://www.elysianbrewing.com/events
tags: [Beer, "Capitol Hill"]
firstSeen: 2026-08-30
lastChecked: 2026-09-02
pr: 1347
---

Seattle craft brewery chain (Capitol Hill flagship, Georgetown Alchemy
Lab, plus other WA locations). `/events` page is a plain Drupal 10 site
(no ICS/JSON feed found; individual event pages carry no JSON-LD).

Investigated 2026-08-30:
- `/events` returns HTTP 200, server-rendered HTML — fetchable, not
  blocked.
- Only **2 upcoming items** in the "Upcoming Events" view block:
  "Trivia Tuesdays @ Capitol Hill Pub" (recurring weekly, free-text
  `"Every Tuesday, 7-9 PM"`) and "Great Pumpkin Beer Festival 2026"
  (`"10 03, 2026 • 4:00PM - 10:00PM"`, Capitol Hill).
- The display-date field is free text with inconsistent formats across
  items (recurring-phrase vs. `MM DD, YYYY • time range`), so a custom
  scraper would need per-format date parsing rather than a single
  regex/ISO parse.
- 🔴 Low confidence: low current volume (2 events) plus non-trivial
  custom date parsing. Worth a re-check once/if the events page fills
  out closer to the Oct 3 festival, or if a JSON/ICS endpoint turns up
  on a future pass.

**Implemented 2026-09-02:** the recurring "Trivia Tuesdays @ Capitol Hill
Pub" item (every Tuesday, 7-9 PM, at the Capitol Hill flagship — 1221 E
Pike St, Seattle, WA 98122; OSM node 1726088085) fits the
`sources/recurring/` model directly and avoids the free-text date
parsing that made the full events page low-confidence. Added as
`sources/recurring/elysian-capitol-hill-trivia.yaml`. The one-off
"Great Pumpkin Beer Festival 2026" (Oct 3) is a single dated event with
no confirmed year-over-year recurrence pattern, so it was left out
rather than guessed at as a schedule.
