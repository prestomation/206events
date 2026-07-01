---
name: "Dreamland Bar & Diner - Dream Girls Drag Brunch"
status: added
pr: pending
platform: recurring YAML (Tock ticketing, no public feed)
url: https://www.dreamlandfremont.com/drag
tags: [Nightlife, Fremont]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---
**Dreamland Bar & Diner** — `https://www.dreamlandfremont.com/drag` — Fremont diner/bar at 3401 Evanston Ave N hosting a weekly "Dream Girls Drag Brunch" every Saturday afternoon.

Investigated 2026-07-01:
- Two fixed weekly showtimes confirmed via the venue's own page and matching Tock ticket listings: an 11:15am "Matinee" (general seating) and a 1:45pm "Premium Seating" show, every Saturday, year-round
- No ICS/API — tickets are sold via Tock (`exploretock.com/dreamland`), which returns HTTP 403 to automated fetches; the schedule itself is a stable weekly pattern stated directly on the venue's own site, so implemented as recurring YAML rather than scraping Tock
- Implemented as two recurring YAML files (one per showtime, mirroring the Unicorn precedent) since `lib/config/recurring.ts` derives an event's id from `${event.name}-${slugifySchedule(schedule)}` — two schedule entries with the identical string `"every Saturday"` in one file would collide on id/cache-key, so each showtime is its own file with a single schedule entry instead
- Exact show duration and ticket price not published; used a conservative PT1H30M and left `cost` unset for the cost-resolver skill to backfill later
- `geo`: 3401 Evanston Ave N, Seattle, WA 98103 (OSM way 114918102)
- `sourceRole: venue`
