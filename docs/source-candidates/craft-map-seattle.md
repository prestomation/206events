---
name: The Craft Map Seattle Fairs
status: added
platform: Custom HTML (directory)
url: https://www.thecraftmap.com/fairs/washington/seattle
tags: [MakersMarket]
firstSeen: 2026-08-14
lastChecked: 2026-08-27
pr: 1300
---

Directory of craft fairs and artisan markets in the Seattle area.

**Checked 2026-08-14:** Confirmed live, well-maintained directory — site
claims 225 Seattle-area craft fairs/art shows/artisan markets tracked,
"new Seattle, WA events every week." 31 upcoming events visible at
check time (Seattle Queer Crafts' Lake Day Aug 15, MiiR Pop-Up Market
Aug 16, The Market Experience Aug 17, seasonal festivals through
December). Native calendar system, sortable by date, no external
platform/ICS identified. Good volume for a markets/makers aggregator.

**Implemented 2026-08-27** (PR #1300): the listing page's JSON-LD `ItemList`
gives 33 fair detail-page URLs, each carrying a JSON-LD `Event` block with
name/date/description/venue but no start time. Ripper fetches the listing,
then each detail page, filling a noon placeholder + `UncertaintyError` for
the always-missing start time (and for the handful of "TBA" venues).
Verified 33 live events via `ONLY_SOURCE=craft-map-seattle`.
