---
name: "Seattle Yarn"
status: added
platform: Shopify (static page, recurring schedule as text)
url: https://seattleyarn.com/pages/in-person-gatherings
tags: [Community, "West Seattle"]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
pr: 1505
---

West Seattle (Admiral) yarn shop at 2701 California Ave SW, Unit B. Runs
Shopify (confirmed via storefront asset URLs); the store's own
`/pages/in-person-gatherings` page is a plain, server-rendered content page
(not a Shopify Events app or products-as-events feed) describing a stable,
named weekly/biweekly "Sit and Stitch" drop-in schedule rather than a
scrapable dated event list.

Investigated 2026-09-16: fetched the page directly — static HTML states
three standing schedules verbatim:
- Every Sunday, 11am–5pm (during regular open hours, drop-in all day)
- Every Tuesday, 1pm–3pm
- The 2nd and 4th Wednesday of every month, 6pm–8pm (explicit upcoming
  dates listed through December confirm the cadence)

No ICS/JSON API — implemented as a single `sources/recurring/` file
(`seattle-yarn-sit-and-stitch.yaml`) with all 3 schedules, per the "one file
per venue with multiple schedules" rule. Geocoded via Nominatim exact match
on the shop itself (OSM node 13448310267, `shop=sewing`, "Seattle Yarn").
Tags `Community`, `West Seattle`. 3 events, 0 parse errors, verified via
`ONLY_SOURCE=seattle-yarn-sit-and-stitch npm run generate-calendars`.
