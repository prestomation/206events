---
name: "Fantagraphics Bookstore & Gallery"
status: added
platform: WordPress / The Events Calendar (Tribe Events REST API)
url: https://blog.fantagraphics.com/events/
tags: [Arts, Books, Georgetown]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
pr: pending
---

Comics/graphic-novel publisher Fantagraphics' bookstore and gallery space at
1201 S Vale St, Seattle, WA 98108 (Georgetown) — book signings, launch
parties, art openings, and their annual "Hot Off the Press Book Fair."

Investigated 2026-07-02:
- `blog.fantagraphics.com/events/` runs The Events Calendar (Tribe) plugin;
  `/wp-json/tribe/events/v1/events` is a live, unauthenticated REST API.
- Also has a working `?ical=1` ICS export, but **the feed is national, not
  Seattle-only** — Fantagraphics is a publisher with signings across many
  cities (Portland, LA, NYC, London, Edinburgh, etc.), all posted to the
  same WordPress calendar. Of the last 6 months of past events (23 total),
  only 2 were at the Seattle venue. A plain `sources/external/` ICS entry
  would therefore be mostly non-Seattle content and fail the
  Seattle-focused bar — this needs a filtering ripper, not a raw ICS
  include.
- The REST API's per-event `venue` object is clean and structured
  (`venue.venue`, `venue.address`, `venue.city`, `venue.state`, `venue.zip`)
  — filter on `venue.venue === "Fantagraphics Bookstore and Gallery"` (or
  `venue.city === "Seattle"`) to keep only the Georgetown venue's own
  events and drop the rest of the publisher's national tour dates.
- Confirmed 1 live upcoming Seattle event as of 2026-07-02: "Hot Off the
  Press Book Fair" (13th annual), Sat July 11 2026, 5-9pm, with a real
  description, image, and venue address from the API.
- Volume is genuinely low (roughly 2 Seattle-venue events per 6 months
  historically) — comparable to already-accepted low-volume sources
  (Shunpike, Book Larder). Per the "Directive: Low-Volume Sources Are
  Valid" rule this is still worth adding; the pipeline will pick up future
  signings as Fantagraphics posts them.
- `geo`: fixed — Fantagraphics Bookstore and Gallery, 1201 S Vale St,
  Seattle, WA 98108 (Georgetown).
- `sourceRole: venue` — first-party events at their own retail space.
