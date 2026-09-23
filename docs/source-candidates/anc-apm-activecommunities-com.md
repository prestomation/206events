---
name: Seattle Parks & Rec activities (ActiveCommunities ANC)
status: added
platform: ActiveCommunities
url: https://anc.apm.activecommunities.com/seattle/
tags: ["board-games", "cozy", "learning", "fitness"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
pr: 1571
---

Discovered via aggregator gap analysis. 7 events in the Seattle
metro sample. Source domain: anc.apm.activecommunities.com.

Sample event: "Drop-In: Mahjong" (2026-08-25T19:00:00.000Z)
Description: Hong Kong Mahjong is similar to rummy and you can pick up the basics in an afternoon. Come play this tile game of strategy, skill and a bit of luck. Age 50+.

**Checked 2026-09-23 (investigating):** Seattle Parks & Rec ActiveNet. Public JSON API works with no auth: `POST https://anc.apm.activecommunities.com/seattle/rest/activities/list?locale=en-US` with header `page_info: {"order_by":"","page_number":1,"total_records_per_page":20}` and body `{"activity_search_pattern":{"activity_keyword":"drop-in"},"activity_transfer_pattern":{}}`. Items carry `name`, `date_range_start/end`, `time_range` ("1:30 PM - 4:30 PM", "Noon - ..."), `days_of_week` ("Mon,Tue"), `location.label` (community center), `number`, `detail_url`. Promising for drop-in programs (e.g. Drop-in Mahjong at Magnolia/Rainier/Magnuson CCs), but needs a custom ripper that (a) filters the thousands of registration-only classes down to public drop-ins, (b) expands weekly patterns into occurrences (the list has no per-date data; holiday closures unknown), and (c) maps ~100 community-center labels to addresses/geo. Too large for this batch pass; worth a dedicated PR.

**2026-09-23 (added):** Implemented as custom ripper `sources/seattle_parks_activecommunities/`
(source name `seattle-parks-activecommunities`, `sourceRole: venue`, `geo: null`,
tags Community + Parks, `weatherSetting: mixed`). Two calendars:

- `special-events` — `only_one_day` items in category 31 ("Field Trips, Special
  Events & Overnights"), excluding out-of-town field trips/outings, transportation,
  tournaments, Parents Night childcare and closed Specialized Programs socials,
  and items with location `N/A`. 64 events (festivals, carnivals, tea ceremonies
  at the Japanese Garden, fix-it nights, poetry open mics, bingo...).
- `drop-in` — category 39 ("Drop-In Activities") minus aquatics/athletics
  facility schedules and supervised tot/teen rooms (~48 programs: mahjong,
  bridge, board games, craft circles, improv jam, line dance...). Real dates come
  from `GET /rest/activity/detail/meetingandregistrationdates/{id}` (pattern +
  `weeks_of_month` nth-weekday + `exception_dates` like "11,25 Nov 2026"),
  expanded over a 60-day horizon. 412 events.

Addresses + lat/lng come from `GET /rest/activity/detail/{id}` `centers[0]`,
fetched once per distinct location label. The list API only accepts page number
via a `page_info` header (not part of the fetch-cache key), so the page is
mirrored in an ignored `&page=` query param. ~103 requests per live build
(26 list pages + ~29 detail + ~48 meeting-dates), concurrency 4. Event ids
`sprac-<activityId>-<date>[-HHMM]`.
