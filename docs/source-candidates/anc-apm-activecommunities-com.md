---
name: Seattle Parks & Rec activities (ActiveCommunities ANC)
status: investigating
platform: ActiveCommunities
url: https://anc.apm.activecommunities.com/seattle/
tags: ["board-games", "cozy", "learning", "fitness"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 7 events in the Seattle
metro sample. Source domain: anc.apm.activecommunities.com.

Sample event: "Drop-In: Mahjong" (2026-08-25T19:00:00.000Z)
Description: Hong Kong Mahjong is similar to rummy and you can pick up the basics in an afternoon. Come play this tile game of strategy, skill and a bit of luck. Age 50+.

**Checked 2026-09-23 (investigating):** Seattle Parks & Rec ActiveNet. Public JSON API works with no auth: `POST https://anc.apm.activecommunities.com/seattle/rest/activities/list?locale=en-US` with header `page_info: {"order_by":"","page_number":1,"total_records_per_page":20}` and body `{"activity_search_pattern":{"activity_keyword":"drop-in"},"activity_transfer_pattern":{}}`. Items carry `name`, `date_range_start/end`, `time_range` ("1:30 PM - 4:30 PM", "Noon - ..."), `days_of_week` ("Mon,Tue"), `location.label` (community center), `number`, `detail_url`. Promising for drop-in programs (e.g. Drop-in Mahjong at Magnolia/Rainier/Magnuson CCs), but needs a custom ripper that (a) filters the thousands of registration-only classes down to public drop-ins, (b) expands weekly patterns into occurrences (the list has no per-date data; holiday closures unknown), and (c) maps ~100 community-center labels to addresses/geo. Too large for this batch pass; worth a dedicated PR.
