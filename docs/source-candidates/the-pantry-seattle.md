---
name: The Pantry Seattle
status: investigating
platform: Unknown
url: https://thepantryseattle.com/calendar
tags: [Creation, Food]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Seattle cooking school and community kitchen offering classes, workshops, and food events.

Real, live site (1417 NW 70th St, Seattle, WA). Two WebFetch passes (root and
`/calendar`) did not surface actual class/event listings with dates — the
`/calendar` route's content wasn't rendered in the fetched markdown (likely
JS-driven calendar widget), and no booking-platform (Punchpass/Acuity/
MindBody/Tock) branding was visible; footer shows a custom build (`v1.14.0`,
imgix CDN), not a recognizable off-the-shelf platform. Needs a closer look
(browser render or page-source inspection) to determine if there's a
scrapable events list or backing API before deciding viability.
