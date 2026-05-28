---
name: "Futurewise"
status: added
platform: Custom HTML (Pie Calendar / FullCalendar inline JSON)
url: https://futurewise.org/events/
tags: [Activism, Community]
firstSeen: 2026-05-28
lastChecked: 2026-05-28
pr: 419
---

Statewide land-use and housing nonprofit headquartered in Seattle. Hosts a
year-round mix of community events around Seattle's Comprehensive Plan and
housing advocacy: monthly Comp Plan Happy Hours, farmers-market outreach
shifts, Affordable Housing Week, the "Complete Communities Coalition"
(CCC) series, partner trainings, and one-off rallies/bus tours (e.g.
the May 30, 2026 "BEEP BEEP / CCC Bus Ride Along" district tour).

Found via the source-from-event flow when a "BEEP BEEP" district bus
tour poster was submitted and `event-lookup` returned no match.

**Platform:** WordPress + Pie Calendar plugin. The events page renders
all upcoming events client-side via FullCalendar.js, but the data is
embedded directly in the HTML inside `eventSources: [[ ... ]]` as a JSON
array — no AJAX/REST call required. The plugin's `/wp-json/piecal/v1/events`
endpoint returns 401, so HTML scraping is the supported path.

**Per-event fields:** `title`, `start` (ISO local), `end` (ISO local),
`details` (truncated preview text), `permalink`, `postType`, `postId`.
Locations are not in the JSON payload — events happen across the city
(parks, cafes, bars, online), so the ripper is `geo: null` and the
description carries whatever location context the preview includes.

**Volume:** intermittent — Futurewise typically posts a handful of events
per month. 2 future events were visible on 2026-05-28 (the "SST: Learn
to Tell Your Story" training plus the CCC Bus Ride Along).
