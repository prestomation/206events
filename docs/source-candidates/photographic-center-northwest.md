---
name: "Photographic Center Northwest"
status: added
platform: WordPress (EventON plugin, ajde_events custom post type)
url: https://pcnw.org/wp-json/wp/v2/ajde_events
pr:
firstSeen: 2026-08-01
lastChecked: 2026-08-01
tags: [Arts, "First Hill"]
---

Nonprofit photography education center and gallery at 900 12th Ave (First
Hill), running artist talks, receptions, exhibitions, and paid workshops
(darkroom, studio lighting, digital, alt-process).

Investigated 2026-08-01:
- WordPress site; the public `/events/` page's calendar widget (EventON
  plugin) is entirely client-rendered — no usable static HTML.
- The `wp/v2/ajde_events` REST endpoint (EventON's custom post type) is
  publicly readable and returns real event posts, but the API exposes only
  the WP post creation/modification date, not a queryable event date or a
  future-only filter — the CPT accumulates years of history (997 total
  posts at time of check).
- Event date/time isn't in structured postmeta either; it's embedded as text
  in `content.rendered` in a fairly consistent pattern (e.g. `"October 2,
  2026 | Friday 6pm $100"`), including cross-month date lists and multi-
  session ranges for recurring workshops.
- Verified via `?per_page=100&page=1&_embed=1`: the 100 most-recently-
  modified posts (default `order=desc`, which in practice skews toward
  upcoming events since PCNW edits a post shortly before it happens) yielded
  30 future-dated events extending into December 2026, plus a handful of
  `CLOSED: ...` holiday-closure notices (filtered out, not real events).
- Implemented as a custom `IRipper` (`sources/pcnw/ripper.ts`): fetches the
  first 2 pages (200 posts), regex-parses the first date + optional time
  range out of each post's body, takes only the *first* date for
  multi-session workshops (not every session), and drops past-dated
  results. Posts with no parseable date at all become non-fatal
  `ParseError`s; posts with a date but an ambiguous/missing time become
  `Uncertainty` entries instead of guessing silently.
- `sourceRole: venue`, `geo` fixed to the PCNW building (OSM way
  228857007), confirmed 37 upcoming events via `ONLY_SOURCE=pcnw npm run
  generate-calendars`.
