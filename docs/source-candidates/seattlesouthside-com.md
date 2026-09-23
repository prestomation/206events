---
name: Stoup SeaTac City Trivia Tuesdays
status: investigating
platform: Unknown
url: https://www.seattlesouthside.com/events/stoup-seatac-city-trivia-tuesdays/
tags: ["learning", "nightlife", "cozy"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
pr:
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: seattlesouthside.com.

Sample event: "Stoup SeaTac City Trivia Tuesdays" (2026-08-26T02:00:00.000Z)
Description: Weekly trivia hosted by Geeks Who Drink at Stoup Brewing in SeaTac. Gather your team for brain teasers, pop culture, history, science, music, and more in a lively atmosphere. Free admission.

Checked 2026-09-23: Seattle Southside is the SeaTac/Tukwila/Des Moines regional tourism bureau; the sample event (Stoup SeaTac trivia) and the calendar as a whole cover venues outside Seattle city. Not viable (outside Seattle).

**2026-09-23 (re-evaluated under King County rule, investigating):** SeaTac/Tukwila/Des Moines are in King County, so geography is no longer the blocker. `/events/` loads its listings client-side from Algolia (appId `EYQHJ2IY2M`, index `prod-seattle-southside`) using a search-only key embedded in the page. There's no ICS or server-rendered list. Event detail pages do carry schema.org Event JSON-LD, and the data comes from IDSS (`files.idss.com/C418`). Promising but not doable under the no-hardcoded-keys rule: needs secret `SEATTLE_SOUTHSIDE_ALGOLIA_API_KEY` (plus a custom ripper that queries the index with the page's `calendarName:"Default Calendar"` filter). Another option is to find a key-free IDSS feed. Note: the listing also includes regional arena events (Climate Pledge, ShoWare), so it would be an `aggregator`.
