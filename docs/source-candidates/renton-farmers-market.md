---
name: "Renton Farmers Market"
status: added
platform: Recurring (hand-coded)
url: https://www.rentonfarmersmarket.com/
tags: [Outdoors, Renton, FarmersMarket]
firstSeen: 2026-09-25
lastChecked: 2026-09-25
pr:
---

Weekly farmers market in downtown Renton's Piazza Park, 233 Burnett Ave S —
2026 is its 25th season (confirmed via `rentonwa.gov` news post and search
snippets of the market's own site). Runs Tuesdays 3-7pm, June 2 – September
29 each year.

`rentonfarmersmarket.com` itself returns HTTP 403 with an `sg-captcha:
challenge` header from this environment (SiteGround bot protection) — not
fetchable directly, so no ICS/API/HTML-scrape path is viable here. But the
schedule is a stable, well-documented annual fact (25 consecutive seasons,
same park, same weekday/time pattern, corroborated by the City of Renton's
own newsroom and multiple local press writeups), so it fits the
**recurring calendar** pattern (`sources/recurring/`) rather than a live
scraper — same approach as `georgetown-farmers-market.yaml` /
`wallingford-farmers-market.yaml`.

Implemented as `sources/recurring/renton-farmers-market.yaml`
(`sourceRole: venue`, `geo` resolved to the "Park Piazza" OSM way
74845544, `months: [6,7,8,9]` seasonal restriction). Verified via
`ONLY_SOURCE=renton-farmers-market npm run generate-calendars` — 1 upcoming
event (Sept 29, 2026, the final market of this year's season), 0 errors.
"Renton" neighborhood tag already registered in `city.config.ts`.
