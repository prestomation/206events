---
name: "Seattle Swing Dance Club (Seattle WCS Calendar)"
status: investigating
platform: Squarespace (static page, not an events collection)
url: https://seattleswingdanceclub.com/seattlewcscalendar
tags: [Dance]
firstSeen: 2026-08-10
lastChecked: 2026-08-10
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
