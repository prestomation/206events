---
name: The Dock Sport Bar & Grill
status: added
platform: Recurring (hand-authored)
url: https://fremontdock.com/seattle-fremont-the-dock-sport-bar-and-grill-events
tags: [Trivia, Nightlife, Fremont]
firstSeen: 2026-08-06
lastChecked: 2026-08-10
pr:
---

Fremont sports bar with recurring weekly trivia (Wed) and karaoke
(Thu/Fri/Sat). Not part of the existing HeadInTheCloudsTrivia network
(`sources/headinthecloudstrivia`) already covered elsewhere in the repo.
(The Dock appears once as an event *location* string in
`sources/events12/sample-data.html` — a one-off third-party event, not
a source for The Dock's own calendar — so no real overlap.)

Built on the SpotApps/SpotHopper restaurant platform — a plain `curl`
fetch confirms server-rendered event markup (`event-time`,
`event-add-to-calendar`, `event-info-text` classes), with 13+ "Karaoke"
and 7+ "Trivia" mentions in the raw HTML.

Implemented 2026-08-10 as two hand-authored `sources/recurring/` entries
(no custom scraper needed — the schedule is a fixed weekly cadence, same
pattern as `admiral-pub-trivia.yaml` / `unicorn-seattle-karaoke.yaml`):

- `sources/recurring/the-dock-trivia.yaml` — Trivia Wednesdays, 7:30–9:30pm
- `sources/recurring/the-dock-karaoke.yaml` — Karaoke Night, three schedule
  entries (Thu 8:30pm–12am, Fri 9pm–2am, Sat 8pm–2am)

Address confirmed via the venue's own homepage (1102 N 34th St, Seattle,
WA 98103; Leaflet marker at 47.6488847, -122.3437382) and cross-checked
against Nominatim (OSM way 115681579, "Fremont Dock" pub, 47.6488884,
-122.3437903 — used in the YAML `geo:` block).

Caveat noted on-page: "Not available during playoff games, private
events, or major sporting events" and trivia's start time "may vary
based on sports completion" — an occasional false-positive/skipped
occurrence is expected from the static weekly schedule, same tradeoff
documented on `admiral-pub-trivia.yaml`. Re-verify periodically via the
calendar-verification skill.

Taco Tuesday (weekly $1.50 taco special) was also present on the page
but treated as a recurring food/drink deal rather than an attendable
event, so it was not added as a third source.
