---
name: "The Watershed Pub & Kitchen"
status: added
platform: Custom HTML (server-rendered SPA, "bevwerk" platform)
url: https://www.watershedpub.com/events
tags: ["Nightlife", "Northgate"]
firstSeen: 2026-08-25
lastChecked: 2026-09-02
pr: 1338
---

Discovered via aggregator gap analysis. Neighborhood pub & kitchen at
10104 3rd Ave NE, Seattle, WA 98125 (Northgate/Lake City), hosting live
music, trivia, a silent book club, cider tastings, and periodic food/beer
events.

Investigated 2026-09-02:
- `/events` returns HTTP 200, fully server-rendered HTML (React Router
  SSR "bevwerk" platform) — no JS execution needed, no proxy required.
- No ICS/JSON API found; each event is a `<div class="section events">`
  card with a title (`h2`), a free-text `.blurb-date`, and an HTML
  `.blurb` description.
- `.blurb-date` mixes several shapes: empty (perpetually-recurring
  blurbs like Trivia/Happy Hour), a bare date or date range with no time
  (closure/hours notices), a single date+time, a same-day start/end time
  range, and a multi-day date+time range. The presence of "@" cleanly
  separates real timed events from closure notices; a computed span over
  14 days (e.g. a "Farmers Market Fridays" summer-long special) is
  treated as ongoing venue copy rather than a discrete event and skipped.
- Implemented as a custom `HTMLRipper`
  (`sources/watershed_pub/ripper.ts`). Verified live via
  `ONLY_SOURCE=watershed-pub npm run generate-calendars`: **7 events, 0
  errors** (Live at the Shed x2, Maple Leaf Silent Book Club, Cider
  Tasting Sundays, Alpenfire Cider Dinner, Convergence #129, PickleFest).
- `geo`: 47.7019150, -122.3255337 (OSM node 2461755878, "Watershed Pub").
- Not already covered — `sources/external/press-then-press-cider.yaml`
  only carries Press Then Press's own cider pop-ups (a subset of this
  venue's programming), not the venue's own event lineup.
