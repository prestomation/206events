---
name: "Rough & Tumble Pub"
status: added
pr: 816
platform: recurring YAML
url: https://www.roughandtumblepub.com/events-schedules
tags: [Trivia, Community, Ballard, "Columbia City"]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---

**Rough & Tumble Pub** — `https://www.roughandtumblepub.com/events-schedules` — Seattle's women's sports bar, with a flagship location in Ballard (5309 22nd Ave NW) and a second location in Columbia City (4914 Rainier Ave S, opened 2025).

Investigated 2026-07-02:
- `/events-schedules` is a static Squarespace page (`itemCount: 0`, `typeName: "page"`) — not a real Squarespace events collection, but the weekly schedule is prose-described and stable, same pattern as `admiral-pub-trivia` and `little-red-hen`.
- Confirmed via the page's own text plus third-party listings (EverOut, Visit Ballard) four weekly recurring events:
  - Trivia Tuesday — Ballard, every Tuesday 7:00 PM, hosted by Quizfix
  - Trivia Thursday — Columbia City, every Thursday 7:00 PM, hosted by Quizfix
  - Makers Mondays (with Tea Cozy Yarn Shop) — Ballard, every Monday 7:00 PM
  - Girl Lunch — Ballard, every Friday 12:00 PM (no `cost: free` set — unlike the other three, this is a lunch meetup where attendees order their own food, so no venue-set admission price applies)
- Addresses confirmed via each location's own page and geocoded via Nominatim: Ballard 47.6670341, -122.3850297 (osm way 217363131); Columbia City 47.5573933, -122.2844919 (osm way 603767199, tagged `amenity=pub` "Rough & Tumble").
- The Ballard address geocodes cleanly as `5309 22nd Ave NW, Seattle, WA 98107` — appending "Top Floor" (as printed on the venue's own contact block) caused Nominatim to return no results, so the `location:` field omits it while the `geo.label` keeps the full address for display.
- Implemented as 4 recurring YAML files (one per distinctly-named event, following the Blue Highway Games / Southgate Roller Rink / Little Red Hen pattern of one file per event rather than one per venue) — `sources/recurring/rough-tumble-trivia-tuesday-ballard.yaml`, `rough-tumble-trivia-thursday-columbia-city.yaml`, `rough-tumble-makers-mondays-ballard.yaml`, `rough-tumble-girl-lunch-ballard.yaml`.
