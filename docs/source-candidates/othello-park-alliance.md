---
name: "Othello Park Alliance"
status: notviable
platform: WordPress (static content site, no calendar)
url: https://othellopark.org/
tags: [Community, "Rainier Valley"]
firstSeen: 2026-08-04
lastChecked: 2026-08-04
---

Nonprofit "Friends of the park" org for Othello Park in Southeast
Seattle. Runs the annual **Othello Park International Festival**
(multicultural food/arts/music festival, ~3000 attendees).

Investigated 2026-08-04:
- Site (`othellopark.org`, WordPress) is a history/fundraising/sponsor
  page for the org, not an events calendar — no Tribe Events, ICS, or
  Eventbrite integration found (an `Eventbrite_V1...png` sponsor logo
  image was the only "Eventbrite" hit in the page source).
- Single annual multi-day-adjacent event (one festival date per year) —
  same category as other single-annual-event fairs already excluded
  in this repo (e.g. Assembly Art Fair, Redmond Arts Festival).
- No dated sub-schedule (stages/times) to support a recurring YAML entry
  either.

Not viable: no structured feed, and event volume (1x/year) is below the
bar even for a recurring entry given no consistent weekday/date pattern
was found in the page content.
