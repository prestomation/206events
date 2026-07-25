---
name: Unbound Symphony
status: added
platform: Custom HTML
url: https://www.unboundsymphony.org/
tags: [Music]
firstSeen: 2026-07-25
lastChecked: 2026-07-25
pr:
---

Seattle-based professional orchestra of women and female-identifying
musicians. No calendar platform, ICS feed, or events collection — each
concert lives on its own hand-built Squarespace page with a different
layout, so the ripper (`sources/unbound_symphony/`) has a dedicated parser
per known event page rather than one generic scraper:

- `/summer-popup` — Met Tract Plaza Summer Sounds pop-up series, three
  lunchtime concerts (July 22, July 29, August 5) at 1200 5th Ave, downtown
  Seattle. Free. Location/dates/time are in a consistently labeled block
  ("📍 Location" / "📅 Dates" / "🕛 Time").
- `/summer-festival` — annual multi-day Summer Orchestra Festival,
  concluding in a public performance. Next one is July 7-10, 2027 at
  Highline Performing Arts Center, Burien, WA (a few miles south of
  Seattle — fine per the "few events outside city limits" allowance since
  the org is otherwise Seattle-based). No daily start time is published,
  so it's flagged via `UncertaintyError`.

Low event volume (4 events at time of writing) but a real, working
pipeline. New concert pages on this site will need a matching parser added
to `EVENT_PAGES` in the ripper — there's no generic collection endpoint to
crawl.
