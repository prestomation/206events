---
name: CISC (Chinese Information and Service Center)
status: added
platform: ICS (WordPress + The Events Calendar plugin)
url: https://cisc-seattle.org/events/
tags: [Community, "International District"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
pr:
---

Community services nonprofit headquartered at 611 S Lane St, Seattle
(Chinatown-International District) — early learning, youth programs,
family support, senior care, and healthcare access. Its Sunshine Garden
senior program runs free recurring classes (basic yoga, tech help,
Chinese knot crochet) plus a Russian-speaking senior day program at
North Bellevue Community Center.

Confirmed live ICS feed: `https://cisc-seattle.org/events/?ical=1`
(standard VCALENDAR, WordPress Tribe Events plugin) — 30 upcoming
events at time of check, valid UIDs/locations/times. Verified via
`ONLY_SOURCE=cisc-seattle npm run generate-calendars` (30 events built
successfully). Added as `sources/external/cisc-seattle.yaml`.
