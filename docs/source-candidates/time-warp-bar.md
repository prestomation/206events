---
name: "Time Warp"
status: added
platform: WordPress (Simple Calendar / "Google Calendar Events" plugin — simcal HTML grid)
url: https://timewarp.bar/calendar/events/
tags: [Nightlife, Gaming, "Capitol Hill"]
firstSeen: 2026-09-22
lastChecked: 2026-09-22
pr:
---

Pinball and noodle bar at 1420 10th Avenue, Seattle WA 98122 (Capitol Hill).
Recurring karaoke, DJ nights, and pinball/arcade programming, open 7 days a
week.

Investigated 2026-09-22:
- Found via a fresh "Seattle arcade bar events calendar" discovery search.
  Not previously tracked under any name in `sources/` or
  `docs/source-candidates/`.
- `/events/` links to a real calendar at `/calendar/events/`, which runs the
  WordPress "Simple Calendar" (Google Calendar Events) plugin — the exact
  same `simcal-event` HTML pattern already handled by
  `sources/hellbent_brewing/ripper.ts` (a `<li class="simcal-event">` per
  occurrence, with `data-event-start`/`data-event-end` Unix-second
  timestamps and schema.org `itemprop="startDate"`/`endDate` microdata with
  full ISO-8601 `content` attributes).
- The page server-renders **only the current calendar month** — no
  `?simcal-month=`/`?simcal-year=` query-string pagination and no working
  `admin-ajax.php` action found from this environment (tried
  `simcal_draw_calendar`, returns `0`) — so the ripper's lookahead is
  whatever remains of the current month at fetch time (as little as ~1
  week near month-end, up to ~30 days near month-start). Confirmed 22
  distinct dated events for the remainder of September 2026 at time of
  check: recurring weekly Karaoke (Tuesdays), weekly "Midnight Snack"
  rotating DJ night (Sundays), biweekly "Off The Clock"/"Retrograde" DJ
  nights (alternating Fridays), daily Happy Hour, plus several one-off DJ
  events.
- No ICS/JSON export found (plugin free tier doesn't expose one), and
  no Google Calendar ID is exposed client-side, so this must be an HTML
  ripper rather than an ICS/API source — same conclusion `hellbent_brewing`
  reached for its food-truck calendar on the same plugin.
- Address confirmed via the site's `/contact/` page ("1420 10th Avenue,
  Seattle WA 98122 on Capitol Hill") and an exact OSM POI match
  (`osmType: node`, `osmId: 11880442163`, `leisure=amusement_arcade`,
  name "Time Warp").
- 🔴 Low-tier (custom HTML ripper), but low-risk: the parsing pattern is
  proven and already implemented once in this repo.

Implemented 2026-09-22: `sources/time_warp_bar/` (`sourceRole: venue`,
`geo` from the OSM node above). Verified via
`ONLY_SOURCE=time-warp-bar npm run generate-calendars`.
