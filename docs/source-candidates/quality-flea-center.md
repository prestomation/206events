---
name: "Punk Rock Flea Market Seattle (Quality Flea Center)"
status: notviable
platform: Shopify
url: https://www.punkrockfleamarketseattle.com/pages/upcoming-seattle
tags: [MakersMarket, "Capitol Hill"]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
---

Punk Rock Flea Market Seattle — long-running (since 2006) vendor market
held at the Quality Flea Center, 416 15th Ave E, Capitol Hill.

Investigated 2026-07-11:
- Site is built on **Shopify**. `/products.json` only lists vendor-booth
  purchase SKUs (e.g. "ONE-DAY OUTDOOR VENDOR SPACE"), not event dates —
  not usable via `ShopifyRipper` for actual market dates.
- The one Seattle market per season is announced as freeform prose text
  on `/pages/upcoming-seattle` ("SEPTEMBER 25-27, 2026 AT THE QUALITY FLEA
  CENTER…"); the site nav banner disagreed with the page body on the exact
  dates at time of check (Sept 19-21 vs Sept 25-27), suggesting the copy
  is hand-maintained and not a reliable structured source.
- Only 1-2 Seattle markets per year, dates set irregularly (not a fixed
  weekly/monthly `sources/recurring/` pattern).
- Not viable as a structured source; too low-frequency and unstructured
  to scrape reliably.
