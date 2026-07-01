---
name: "Southgate Roller Rink"
status: candidate
platform: recurring YAML (7 named weekly themed skate nights)
url: http://www.southgaterollerrink.com/schedule.html
tags: [Sports, "White Center"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

**Southgate Roller Rink** — `http://www.southgaterollerrink.com/schedule.html` — roller skating rink at 9646 17th Ave SW, Seattle, WA 98106 (White Center). 21+ evening sessions run nightly with a distinct theme/DJ per night of the week; family skate sessions and a paid "Learn to Skate" class round out the schedule.

Investigated 2026-07-01:
- Plain HTML `schedule.html` page (no JS rendering needed) lists a stable weekly recurring schedule with day-specific named events: Monday "Totally 80's Cheap Skate" ($7), Tuesday "Adult Skate" w/ DJ Slayground ($14), Wednesday "LGBTQIA+ Pride Skate Night" w/ DJ Slayground ($14), Thursday "Adult Skate" w/ DJ Josh ($14), Friday "Live Band Night" 9pm-12am ($20), Saturday "Sk8 Party" 9pm-12am ($18), Sunday "Roll Around Seatown" ($14)
- Address confirmed via Nominatim: 9646 17th Ave SW, Seattle, WA 98106 (47.5160493, -122.3559728), matching OSM node 6120367415 ("Southgate Roller Rink", leisure=sports_centre)
- Skipped as too generic/not distinct "events": Family Skate sessions (multiple per day, effectively normal operating hours) and the Sunday "Learn to Skate" paid class (registration-based instruction, not a themed public night) — same reasoning as skipped registration-based classes in `docs/source-candidates/blue-highway-games.md`
- Implemented as 7 separate `sources/recurring/southgate-roller-rink-*.yaml` files (one per distinctly-named event), following the Blue Highway Games precedent for a single venue with multiple differently-named recurring events (one YAML file = one RipperCalendar/ICS)
