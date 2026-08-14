---
name: "Seattle Swing Dance Club (Seattle WCS Calendar)"
status: added
platform: Styled Calendar (embedded widget on a Squarespace page)
url: https://seattleswingdanceclub.com/seattlewcscalendar
tags: [Dance]
firstSeen: 2026-08-10
lastChecked: 2026-08-14
pr:
---

Community-run West Coast Swing calendar aggregating classes, workshops, and
socials from multiple Seattle-area organizers/venues. Explicitly not tied to
one venue — events are submitted by organizers via a form ("Add your event to
this calendar"), with a disclaimer that the club "does not own or operate all
events listed."

Investigated 2026-08-10:
- Squarespace confirmed (`images.squarespace-cdn.com` asset URLs)
- `?format=json` returns a static `page` type (`calendarView: false`,
  `itemCount` absent) — not a real Squarespace events collection, so the
  built-in `squarespace` ripper type won't work
- Calendar content appears to be rendered via an embedded third-party
  website-component/widget rather than server-side Squarespace data — would
  need to identify the underlying widget's data source (e.g. an embedded
  Google Calendar) before this is scrapable

**Verdict**: Needs more investigation to find the widget's actual data feed
before this can be implemented as a ripper.

Re-investigated 2026-08-14: found the widget's iframe (`embed.styledcalendar.com/#<id>`)
and its underlying data API. The repo already has a built-in `styledcalendar`
ripper type (`lib/config/styledcalendar.ts`, used by `couth_buzzard`) that
hits exactly this API (`embed.styledcalendar.com/api/get-styled-calendar-events-data/?styledCalendarId=<id>`,
LZ-String-compressed per-Google-calendar event arrays) — no new ripper code
needed, just a `ripper.yaml` with `type: styledcalendar` and the
`styledCalendarId` (`jXHhMhnUux4yMQJoT1Uj`) pulled from the embed iframe src.

Confirmed working: the API returns 5 underlying Google-calendar feeds
(538 total events, mixing past and future); after the ripper's built-in
future-event filter, 11 upcoming events remain, 7 of them at Phinney
Community Center in Seattle (the club's recurring "Westie Brunch Dance"
and a WCS class series), plus a handful of out-of-town conventions
("Bend Connection", "SwitchOn Northwest", "Sea to Sky", "Retaliation
Swing") that the wider West Coast Swing community also tracks — majority
Seattle, consistent with the "few events outside city limits is OK" rule.
`sourceRole: aggregator` / `geo: null` (multi-venue community calendar, not
one venue). Implemented as `sources/seattle_swing_dance_club/ripper.yaml`.
`ONLY_SOURCE=seattle-swing-dance-club npm run generate-calendars` produced
11 events, 0 errors.
