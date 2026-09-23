---
name: Dance Classes for Traditional Gujarati Folk Dance
status: blocked
platform: Unknown
url: https://www.visitbellevue.com/event/dance-classes-for-traditional-gujarati-folk-dannce/11113/
tags: ["dancing", "cultural", "fitness", "film"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 8 events in the Seattle
metro sample. Source domain: visitbellevue.com.

Sample event: "Dance Classes for Traditional Gujarati Folk Dance" (2026-08-25T02:15:00.000Z)
Description: Looking for some fun dancing and fitness, Gujarati style? Dance classes for traditional Gujarati folk dance hosted weekly on Mondays in Redmond, WA. 7:15-8:45 PM. $20 drop in.

Checked 2026-09-23: notviable, outside Seattle. visitbellevue.com is the Bellevue tourism board's listing (sample event is in Redmond); it covers Eastside venues, not Seattle.

**Re-evaluated 2026-09-23 (King County rule):** Bellevue is now in scope. The site is Simpleview CMS. The full events API (`/includes/rest_v2/plugins_events_events_by_date/find/`, using a token from `/plugins/core/get_simple_token/`) returns Akamai **403 Access Denied** even with browser headers. The only other feed is `/event/rss/`, which is capped at 30 items, has no start times, and gives multi-week runs as date ranges (e.g. RAGTIME at Village Theatre 09/16 to 10/18). That would need per-event detail-page scraping for a tourism aggregator that mostly republishes venues listed elsewhere. Blocked by the Akamai WAF on the API.
