---
name: "Jazz Alley"
status: added
platform: Custom HTML (JSP)
url: https://www.jazzalley.com/www-home/calendar.jsp
tags: [Music, Belltown]
firstSeen: 2026-05-08
lastChecked: 2026-09-02
pr: 1354
---

Established Seattle jazz venue at 2033 6th Ave, Belltown. Custom JSP calendar at
`https://www.jazzalley.com/www-home/calendar.jsp`. Previously flagged `proxy`
(2026-05-08 — 503 on all paths from the sandbox and CI runner IPs).

Re-checked 2026-09-02: `calendar.jsp` now returns a normal HTTP 200 with real,
structured event data — the earlier 503 was evidently transient (site
maintenance/outage), not a persistent block. No proxy needed after all.

The calendar page lists 26 upcoming "shows" (an artist's multi-night run) as
`.news-box` cards linking to `artist.jsp?shownum=N`, but only a date *range*
per show (e.g. "Thu, Sep 3 - Sun, Sep 6, 2026") — no individual showtimes.
Each show's own detail page carries the real per-night (sometimes
per-set, early/late) performance list in a `<select name="perfnum">`
(e.g. "Fri, Sep 4, 2026 9:30 PM"), plus the ticket price. Implemented as a
custom `IRipper` (`sources/jazz_alley/ripper.ts`) doing a two-level scrape:
parse the 26 show cards from `calendar.jsp`, then fetch each show's
`artist.jsp?shownum=N` for its real performances. One fully sold-out
performance found live (`shownum=8809`, reuses `value="0"` with a
" - FULL" text suffix rather than a real perfnum) is parsed and emitted with
`cost: { soldOut: true }` rather than dropped or errored.
`sourceRole: venue`, fixed `geo` (Nominatim, 47.6145805/-122.3391523).
100 events, 0 errors confirmed via `ONLY_SOURCE=jazz-alley npm run
generate-calendars` against the live site.
