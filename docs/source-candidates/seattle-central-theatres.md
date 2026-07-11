---
name: "Seattle Central Theatres"
status: investigating
platform: Custom (Drupal 10)
url: https://theatres.seattlecentral.edu/event-calendar
tags: [Theatre]
firstSeen: 2026-07-03
lastChecked: 2026-07-11
pr:
---

Seattle Central College's performance venues — **Broadway Performance Hall** and
**Erickson Theatre** — share an events calendar at `theatres.seattlecentral.edu`, with
per-venue sub-pages at `/broadway-performance-hall/event-calendar` and
`/erickson-theatre/event-calendar`.

Investigated 2026-07-03:
- Site runs on Drupal 10 (confirmed via `X-Generator` header and page meta tag)
- No ICS export found — `?format=json` and `/events.ics` both fall through to the normal
  HTML page (HTTP 200, `text/html`)
- No `ical`/`.ics`/`/api/`/`/rest/` links found in the static page markup
- The calendar grid content is not present in the static HTML response — likely rendered
  client-side (JS/AJAX), so a plain fetch doesn't surface event data
- 🔴 Low confidence — would need either a custom scraper that drives the JS-rendered
  calendar, or discovery of an underlying Drupal Views AJAX/JSON endpoint (not found yet).
  Left as `investigating` rather than `notviable` since the venue calendar clearly exists;
  needs a browser-based network-tab inspection to find the real data endpoint.

Re-checked 2026-07-11: the calendar widget is actually Trumba (`$Trumba.addSpud({webName:
"seattletheatres_calendar", ...})`), not 25Live — the `25livepub.collegenet.com/scripts/spuds.js`
script tag is Trumba's own spud loader (hosted on that domain), a red herring, not a 25Live
integration. Trumba normally exposes a direct ICS export at `trumba.com/calendars/<webName>.ics`,
but `https://www.trumba.com/calendars/seattletheatres_calendar.ics` returns HTTP 410 Gone (other
path variants 404), meaning either the webName is stale or the calendar was unpublished from
Trumba's export feature. Still `investigating` — would need a browser session to inspect the
live Trumba widget's actual XHR calls (the `s.aspx` loader endpoint) to find the correct feed
identifier, which isn't visible from a plain HTML fetch.
