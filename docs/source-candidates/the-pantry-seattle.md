---
name: The Pantry Seattle
status: added
platform: Unknown
url: https://thepantryseattle.com/calendar
tags: [Creation, Food]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
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

**2026-09-23:** Added as `sources/the_pantry_seattle/` (custom ripper, name `the-pantry-seattle`, `sourceRole: venue`, geo 1417 NW 70th St). The calendar widget reads a paginated JSON API: `/api/events.json?dateRange=YYYY-MM-DD,YYYY-MM-DD&page=N` (10 per page, `meta.pagination.total_pages`), one item per dated class/dinner session with start/end datetimes, class URL, and instructors. 198 events over the next ~4 months at verification.
