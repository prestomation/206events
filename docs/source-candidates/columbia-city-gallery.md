---
name: "Columbia City Gallery"
status: added
firstSeen: 2026-05-25
lastChecked: 2026-05-26
tags: [Arts, Community, Columbia City]
url: https://www.columbiacitygallery.com
pr: 412
---
Nonprofit artists' cooperative in Columbia City with regular public programming: life drawing sessions, juried shows, artist talks, and workshops. Columbia City / South Seattle neighborhood currently underrepresented in the calendar.

Investigated 2026-05-26:
- Platform: WordPress with **The Events Calendar (Tribe Events)** plugin
- Tribe Events REST API confirmed: `https://columbiacitygallery.com/wp-json/tribe/events/v1/events`
- 15 upcoming events returned (exhibitions, receptions, life drawing sessions)
- API returns `start_date_details` / `end_date_details` in same format as Downtown Seattle Association
- Implemented as `sources/columbia_city_gallery/` using custom ripper (Tribe Events v1 API + pagination)
- Tags: Arts, Columbia City
