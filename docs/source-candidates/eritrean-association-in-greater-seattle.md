---
name: "Eritrean Association in Greater Seattle"
status: notviable
platform: Squarespace
url: https://www.eritreanassociation.org/events
tags: [Community]
firstSeen: 2026-07-06
lastChecked: 2026-07-06
---

Community center at 1528 Valentine Place South, Seattle. Hosts annual
observances: 49th Annual Festival, Women's International Day (Mar 8),
Eritrean Independence Day (May 24), Martyr's Day (Jun 20), Multigenerational
Day, year-end celebration.

Investigated 2026-07-06: Squarespace confirmed, but the `/events` page's
`events-stacked` collection is empty (`mainContent` renders an empty div,
`?format=json` shows no populated `upcoming`/`past` items). The actual
content lives under `/events-blog/<slug>` as informational posts about
annual observances (e.g. `/events-blog/martyrs-day`, `/events-blog/49th-annual-festival`)
with no consistent day-level date shown outside prose — same shape as other
previously-rejected single-annual-event orgs with no scrapable structured
feed. Not viable.
