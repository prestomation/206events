---
name: The Traveling Goat
status: added
platform: Custom HTML (Wix site, hand-authored /events page — no calendar plugin)
url: https://www.travelinggoatseattle.com/events
tags: ["Music", "Nightlife", "Trivia", "QueenAnne"]
firstSeen: 2026-08-25
lastChecked: 2026-09-11
---

Neighborhood bar at 621 1/2 Queen Anne Ave N, Seattle, WA 98109
(47.625159, -122.3570891). Originally discovered via aggregator gap
analysis (1 sample event, "Guess What? Trivia! 7p").

Re-checked 2026-09-11: the `/events` page is a hand-built Wix layout
(not the Wix Events widget, no schema.org markup, no stable component
ids), but it renders server-side with a genuinely clean, repeating
plain-text structure: each event is three consecutive rich-text blocks
in document order — a `p.font_8` date line ("Sep 14, 2026"), an
`h2.font_2` title, and a `p.font_8` description. 12 real upcoming
events at time of check: weekly trivia (Mondays), several live-music
bookings, a Sonics/Storm watch-party happy hour, and a themed
"Negroni Week" promo with no explicit start time.

Implemented as a custom `IRipper` (`sources/traveling_goat/ripper.ts`)
that walks the font_8/font_2 blocks and groups them into
(date, title, description) triples. Start time is parsed from a
trailing "@ 7p" / "730p" marker in the title when present; the one
listing with no time marker ("Negroni Week") is emitted with an
`UncertaintyError` (`startTime`) rather than guessed. Verified via
`ONLY_SOURCE=traveling-goat npm run generate-calendars`: 12 events,
0 parse errors, 1 non-fatal uncertainty.
