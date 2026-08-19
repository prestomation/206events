---
name: "Seattle Yoga News"
status: candidate
platform: WordPress (The Events Calendar / Tribe Events)
url: https://seattleyoganews.com/calendar/
tags: [Wellness]
firstSeen: 2026-08-19
lastChecked: 2026-08-19
pr:
---

Citywide aggregator calendar for yoga classes, workshops, retreats, and
teacher trainings across Seattle-area studios ("The Yoga Calendar for the
Seattle Area Yoga Community"). Would be `sourceRole: aggregator`,
`geo: null` if implemented (multi-venue).

Investigated 2026-08-19: confirmed running The Events Calendar (Tribe
Events) plugin — `/wp-content/plugins/the-events-calendar/...` present, and
the page links an iCal feed (`/events/?ical=1`). However:
- The Tribe REST API (`/wp-json/tribe/events/v1/events`) currently returns
  `"total":0` for the next 2 years.
- The `?ical=1` feed returns HTTP 200 but an **empty body** (0 bytes,
  `content-type: text/html` rather than `text/calendar` — looks like the
  plugin's ICS export route isn't wired up, not just "no events right now").

Per the "200 + 0 events" rule: don't implement yet. Plain `sources/external/`
ICS candidate if the feed starts returning real `VEVENT`s on a future check;
worth re-verifying the `/events/?ical=1` URL and the Tribe REST endpoint
together next cycle before implementing.
