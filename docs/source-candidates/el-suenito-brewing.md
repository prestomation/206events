---
name: El Sueñito Brewing (Fremont)
status: added
platform: Wix (custom scraper)
url: https://www.elsuenitobrewing.com/events
tags: [Beer, Fremont]
firstSeen: 2026-07-19
lastChecked: 2026-07-22
pr: pending
---

Brewery/taproom with two locations — flagship in Bellingham and a
second taproom in Seattle's Fremont neighborhood (grew out of Frelard
Tamales). The Fremont location hosts regular drag brunches, trivia
nights, karaoke, and drag bingo; events page shows dates spanning
July–August 2026 (`/event-details/tuesday-night-trivia-seattle-3`, etc.).

Investigated 2026-07-19:
- Built on Wix; no `application/ld+json` Event schema, no exposed
  `wix-events` REST endpoint, and no ICS export found in the fetched
  static HTML — events appear to render via Wix's client-side app,
  so a plain HTML/JSON fetch doesn't see them
- 🔴 Low tier: would need either a Wix Events API endpoint discovery
  pass or JS-rendering (Browserbase) to confirm the real data shape
  before writing a custom ripper — do not guess at the shape
- Also need to filter Bellingham-only listings (e.g.
  `bellingham-july-drag-brunch-2`) out of whatever feed is found, since
  only the Fremont/Seattle events are in scope

Implemented 2026-07-22 — the "needs JS rendering" assumption above was
wrong: Wix server-renders every upcoming event (title, description,
scheduling, location, image) into a `<script type="application/json"
id="wix-warmup-data">` blob used to hydrate the page client-side, readable
from a plain static fetch with no JS execution needed.
`sources/el_suenito_brewing/ripper.ts` (custom `HTMLRipper` subclass) reads
that blob and filters to Seattle events using the structured
`location.fullAddress.city` field (not the freeform `location.name`/
`location.address` text, which was observed mislabeled as Bellingham on at
least one Seattle event despite matching structured city/zip/street/geocode
— same shared-feed-by-geocoded-city pattern as
`browne_family_vineyards_seattle`). Verified via
`ONLY_SOURCE=el-suenito-brewing npm run generate-calendars`: 6 Seattle
events, 0 errors (Queer Book Club, Karaoke with KJ Squawks, July Seattle
Sueñito Drag Brunch, Blood Drive, August 1st Drag Bingo, Tuesday Night
Trivia - Seattle).
