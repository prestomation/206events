---
name: "Georgetown Morgue (Seattle Haunts)"
status: added
platform: none (image-only calendar; WordPress site, Next.js/hytix.com ticketing SPA)
url: https://seattlehaunts.com/schedule-and-events/
tags: [Halloween, Georgetown]
firstSeen: 2026-09-17
lastChecked: 2026-09-23
---

Seasonal Halloween haunted-house attraction, 5000 E Marginal Way S,
**Georgetown, Seattle** (unlike the already-rejected `nile-nightmares.md`,
this one is genuinely inside city limits).

Investigated 2026-09-17:
- Main site `seattlehaunts.com` is WordPress (`wp-json` REST API present,
  but only exposes CMS pages, not event data).
- The `/schedule-and-events/` page's actual open-day calendar is published
  as a **raster image** (`wp-content/uploads/2026/04/calendar26.png`), not
  text or structured markup — confirmed by fetching and viewing the image.
  No ICS/API/JSON-LD found anywhere on the WordPress site.
- Decoded the image for the 2026 season: open Fri/Sat every week from
  Sep 25 – Nov 7, plus Sun from Oct 4, Thu from Oct 8, and Wed added only
  the last two weeks (Oct 21, 28) — an irregular, hand-drawn pattern, not
  a clean weekly rule.
- Ticketing is at `seattlehaunts.fearticket.com`, a Next.js SPA on the
  `hytix.com` platform — no public JSON API endpoint found in a quick pass
  (would need network-trace/Playwright investigation to confirm one
  exists).
- Hours are not published as text anywhere (FAQ page punts back to the
  same image).

**Why not implemented this cycle:** the repo's `sources/recurring/`
schedule DSL (`every <day>` + `months: [...]`) only restricts by calendar
month, not by exact date range — so encoding "every Friday" with
`months: [9, 10, 11]` would wrongly generate phantom event dates for
early September and early November that the venue is not actually open.
Implementing this correctly would require either (a) a real API behind
the fearticket.com/hytix.com ticketing SPA (unconfirmed), or (b) a custom
ripper that reads the calendar image every build (no vision step exists
in the build pipeline) or hardcodes this season's exact dates (would go
stale every year with no drift detection, unlike the recurring DSL which
`skills/calendar-verification` can re-check).

Re-evaluate: (1) if fearticket.com/hytix.com turns out to expose a public
session/showtime API (check via Playwright network trace), or (2) if
`seattlehaunts.com` ever publishes the schedule as text instead of an
image.

**2026-09-23:** Found the data API behind the fearticket.com/hytix.com SPA:
`https://api2.hytix.com/v2/public/events/5441/dates` (public, no auth) returns
open nights keyed by date with 15-minute entry slots (ticketType 1); closed
nights carry a season-long placeholder (ticketType 2) that is skipped.
Implemented as custom JSON ripper `sources/georgetown_morgue/` (source name
`georgetown-morgue`, one event per open night, first slot start to last slot
end). Event id 5441 is per-season ("Georgetown Morgue 2026"); the yaml notes
how to update it next year, and `expectEmpty: true` covers the off-season.
Verified: 26 events, 0 errors.
