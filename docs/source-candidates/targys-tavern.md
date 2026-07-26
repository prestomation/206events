---
name: "Targy's Tavern"
status: added
pr: 1021
platform: Recurring (weekly trivia + bingo)
url: https://triviascout.com/bar/targys-tavern-seattle
tags: [Trivia, "Pub Trivia", "Queen Anne", Nightlife]
firstSeen: 2026-07-25
lastChecked: 2026-07-26
---

Dive bar at 600 W Crockett St, Queen Anne, Seattle, WA 98119.

- Trivia — every Wednesday, 7:30pm (hosted by "April", free, teams of 6)
- Bingo — every Tuesday, 8pm
- No ICS/API — implemented as two files,
  `sources/recurring/targys-tavern-trivia.yaml` and
  `sources/recurring/targys-tavern-bingo.yaml` (distinct
  names/descriptions/tags per event, same split as
  `unicorn-seattle-trivia` / `unicorn-seattle-drag-bingo`).
- Not already covered — checked `sources/`, `sources/external/`,
  `sources/recurring/`, and `docs/source-candidates/` for "targy"; no
  match.
- Verified 2026-07-26 via `trivianearme.net`'s schema.org JSON-LD
  (independent of the original triviascout.com discovery source):
  `"Trivia Wednesdays at 7:30pm hosted by April. Free to play, teams of
  6, prizes. Also hosts Bingo Tuesdays at 8pm."` Geocoded via Nominatim
  to the OSM pub node (lat 47.6378861, lng -122.3651630).

Sources:
- https://triviascout.com/bar/targys-tavern-seattle
- https://trivianearme.net/seattle/venues/targy-s-tavern
- https://www.king5.com/article/entertainment/television/programs/evening/bar-dive-drinks-wells-beer-deals-happy-hour-fun-bingo-trivia-queen-anne-seattle-upper-five-star-extreme-jose-tall-boys-music-neighborhood-tavern-love/281-8fdf12a0-268c-4797-be16-a95930060062
