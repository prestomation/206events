---
name: Seattle Chamber of Connection
status: added
platform: Squarespace
url: https://www.seattlechamberofconnection.org/event-calendar
tags: [Community, Learning]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
pr: 1351
---

Seattle community organization hosting networking events, workshops, and professional gatherings.

**Vetting notes (2026-08-14):** Real 501(c)(3) nonprofit, confirmed
Squarespace (`squarespace-cdn.com`). Page lists dated events (e.g. "Sept 12th
— in Ballard with National Nordic Museum", "May 30th" downtown event). Small
volume but legitimate. No dedicated ICS/API feed found directly, but as a
Squarespace events collection it likely supports `?format=json`/`?format=ical`
— worth checking before writing a custom scraper. Note: they also link out to
a separate Luma calendar (`luma.com/Seattlewelcomeweek`) for a specific
partnership program, which is a different potential source entirely. Not yet
covered by any existing source.

**Implemented 2026-09-02:** Re-investigated — the `/event-calendar` page's
`?format=json` returns an empty static page (`data-type="page"`), not a
Squarespace events collection, so the Squarespace built-in type doesn't
apply after all. However, the page itself is a text list of events, most
linking out to a Luma calendar for their recurring "Best Day Ever"
neighborhood-tour series (a different Luma calendar than the previously
noted `Seattlewelcomeweek` one). Found the calendar id (`cal-uCEOOuhY6UQpJ77`,
title "Best Day Ever") embedded in `https://luma.com/bestdayever` and
confirmed its standard Luma ICS export
(`https://api.lu.ma/ics/get?entity=calendar&id=cal-uCEOOuhY6UQpJ77`, same
pattern as the existing `seattle-tech-forum` source) returns a valid
`VCALENDAR` with 2 upcoming events, each carrying a full street address and
`GEO` coordinate (Ballard's National Nordic Museum, Hillman City's Black &
Tan Hall). Implemented as `sources/external/seattle-chamber-best-day-ever.yaml`
(`sourceRole: venue` — the Chamber's own recurring series, just hosted at a
different partner venue each month; `geo: null` since the venue rotates).
2 events, 0 errors confirmed via `ONLY_SOURCE=seattle-chamber-best-day-ever
npm run generate-calendars`.
