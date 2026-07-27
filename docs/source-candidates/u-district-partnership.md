---
name: U District Partnership
status: added
platform: Custom HTML
url: https://udistrictseattle.com/about/events
tags: [University District, Community]
firstSeen: 2026-07-26
lastChecked: 2026-07-26
pr: 1025
---

Discovered via a poster lookup (`skills/source-from-event`): a photographed
U District street sign listing five annual signature events organized by
The U District Partnership (Winter Window Walk, U District Cherry Blossom
Festival, U District Street Fair, Seattle Boba Fest, U District Chow Down).
None matched anything in the published events index, and the org itself
(udistrictseattle.com) was not covered by any existing source.

The org's events page (`/about/events`) is a static WordPress page — no
ICS/API/known platform, just a "features" grid of cards (title, free-text
date, description, image, "Learn More" link). It currently lists four of
the five poster events with concrete dates/date-ranges:

- Seattle Boba Fest — August 1, 2026
- U District Chow Down & Street Party — October 3, 2026
- U District Street Fair — May 15 & 16, 2027 (two-day range)
- U District Cherry Blossom Festival — "Spring 2027" (a season, not a
  month — no date announced yet, so the ripper skips this card silently
  rather than guessing or erroring; it starts appearing once the org
  publishes a real date)

Winter Window Walk isn't currently listed (past its Dec 2025 occurrence per
the poster; presumably reappears once the Winter 2026 edition is announced).

The page also has a second "Other Events & Performance Venues" section
reusing the same card markup as a plain venue directory (Neptune Theatre,
Jet City Improv, Burke Museum, U District Art Walk, etc.) with no dates at
all — not scraped. U District Art Walk there is already covered by
`sources/recurring/university-district-artwalk.yaml`.

No start time/duration is ever published on this page, so every event
carries an `Uncertainty` error for `startTime`/`duration`.

Implemented as `sources/u-district-partnership/` (custom `HTMLRipper`).
`sourceRole: venue`, `geo` set to the University District centroid
(matching the `university-district-artwalk` convention), `weatherSetting:
mixed`. Verified locally with `ONLY_SOURCE=u-district-partnership npm run
generate-calendars` — 3 events, 0 errors. (Cherry Blossom Festival's
seasonal-only date is skipped silently rather than reported as a
`ParseError` — a genuine `ParseError` on a brand-new source blocks CI's
new-source gate, and this isn't a parsing gap to flag, just a date the
org hasn't set yet.)
