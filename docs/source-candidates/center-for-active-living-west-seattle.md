---
name: "The Center for Active Living (formerly Senior Center of West Seattle)"
status: added
platform: "ICS feed (WordPress calendar plugin)"
url: https://wscenter.org/calendar/
tags: ["Community", "West Seattle"]
firstSeen: 2026-08-17
lastChecked: 2026-08-18
pr:
---

**The Center for Active Living** — `https://wscenter.org/calendar/` — senior
center at 4217 SW Oregon St, Seattle, WA 98116 (West Seattle). Formerly named
"Senior Center of West Seattle." Runs recurring classes and programs (fitness,
computer lab, line dancing, support groups, community dining, tech help,
quilting, movie nights, etc.).

Investigated 2026-08-17:
- `https://wscenter.org/calendar/?ical=1` returns a valid ICS feed directly
  (`content-type: text/calendar`,
  `content-disposition: attachment; filename="the-center-for-active-living-....ics"`).
- Confirmed **100 VEVENTs** (feed appears capped at 100), with `DTSTART`
  dates running from today through Nov 2026 and outlier occurrences into
  2027 (Mar 2027, Nov 2027) — the pipeline is live and produces genuinely
  future-dated events.
- Every event carries the same `LOCATION`: "The Center for Active Living,
  4217 SW Oregon St., Seattle, WA, 98116, United States" — fixed venue,
  `sourceRole: venue`, `geo` should be set to this address (not `null`).
- Events are mostly recurring weekly/biweekly program instances (Gentle
  Chair Yoga, Line Dancing Level 1/2, Ukes Sing-along, Aging Well groups,
  Men's Support Group, Burke Dykes Computer Lab) rather than one-off special
  events — similar in character to other already-added recreation-class
  sources. No content review needed beyond the standard ICS ripper path.
- 🔥 High confidence for `sources/external/<name>.yaml` — plain ICS URL, no
  custom ripper code needed.
- Not yet implemented — leaving as a candidate for a future implementation
  cycle (this run's scope was discovery/candidate-list only).

Implemented 2026-08-18 as `sources/external/center-for-active-living.yaml`:
- `ONLY_SOURCE=center-for-active-living npm run generate-calendars` produced
  **100 events**, 1 venue in `venues.json`, no parse or geocode errors.
- `geo` resolved via Nominatim to the OSM way `450278367`
  ("Senior Center of West Seattle", the venue's former name) at
  47.5626534/-122.3862787.
- Tagged `Community` + `West Seattle`; `sourceRole: venue` (fixed address on
  every VEVENT).
- One transient JS bot-challenge response was observed mid-session on the ICS
  URL (a `window.location.reload()` interstitial instead of the feed). It did
  not reproduce on any subsequent fetch, with or without a browser UA, so this
  is not treated as a block. If it recurs in CI, the fetch cache's stale-serve
  fallback covers it; a persistent recurrence would be the signal to stage the
  source for proxy testing.
