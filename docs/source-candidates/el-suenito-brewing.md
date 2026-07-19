---
name: El Sueñito Brewing (Fremont)
status: candidate
platform: Wix
url: https://www.elsuenitobrewing.com/events
tags: [Beer, Fremont]
firstSeen: 2026-07-19
lastChecked: 2026-07-19
pr:
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
