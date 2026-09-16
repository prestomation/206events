---
name: "Swamp Cow Kava Lounge"
status: added
platform: Custom (recurring YAML — fixed weekly schedule, no scrapable calendar)
url: https://www.swampcowkavalounge.com/weekly-events
tags: [Trivia, OpenMic, Gaming, Belltown]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
pr: 1508
---

All-ages, alcohol-free kava lounge at 159 Denny Way, Suite 105, Belltown
(Uptown/Belltown border), serving adaptogenic drinks (kava, blue lotus)
alongside kombucha and NA beer.

Investigated 2026-09-16:
- Dedicated `/weekly-events` page lists a fixed, recurring weekly
  schedule with no date-to-date variation — no ICS/JSON/API needed,
  matches the `sources/recurring/<name>.yaml` pattern (like
  `hopvine-pub-open-mic.yaml`).
- **Wednesday: Trivia Night** 7:30–9:00pm, hosted by `@206__Trivia`
- **Thursday: Open Mic** 7:00–10:00pm (sign-ups from 6:30pm) — "big
  talent, questionable ideas, first-timers, regulars"
- **Friday: Last Bula** 7:00–10:00pm — casual gaming hangout (Super
  Smash Bros. / Switch titles) and socializing
- All-ages, no admission fees mentioned for any of the three — treated
  as `cost: free`
- Confirmed venue address via Nominatim: OSM node `13325088101`
  ("Swamp Cow kava bar"), 47.6184462, -122.3536462
- Not a religious org; not found under `sources/` or existing
  `docs/source-candidates/`

Implemented as three recurring YAML files (one per distinct weekly
series, following the Hopvine Pub precedent of separate files per
series rather than folding unrelated event types into one file's
`schedules:` list):
`sources/recurring/swamp-cow-kava-lounge-trivia.yaml`,
`sources/recurring/swamp-cow-kava-lounge-open-mic.yaml`,
`sources/recurring/swamp-cow-kava-lounge-last-bula.yaml`.
