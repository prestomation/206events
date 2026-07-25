---
name: "SLU Farmers Market"
status: candidate
platform: Recurring (seasonal weekly)
url: https://slumarket.com/
tags: [FarmersMarket, "South Lake Union"]
firstSeen: 2026-07-25
lastChecked: 2026-07-25
---

South Lake Union's farmers market, next to The Spheres — spans two city
blocks with 100+ vendor booths, up to 30 Washington farmers, plus
prepared foods/seafood/dairy.

- Season: Saturdays, June 6 – November 21 (2026), 10am–3pm
- Location: South Lake Union, near The Spheres (Amazon HQ), Seattle
- No ICS/API found — `slumarket.com` is a simple informational site with
  a static schedule, not a Squarespace events collection or ICS feed.
  Fits the `sources/recurring/<name>.yaml` pattern (fixed weekly
  schedule + `seasonal` restriction), same shape as the other
  neighborhood farmers markets already in `sources/recurring/`.
- Distinct from the existing `sources/recurring/*-farmers-market.yaml`
  entries (Ballard, Capitol Hill, Central District, Columbia City,
  Georgetown, Lake City, Lake Forest Park, Magnolia, Phinney, Queen
  Anne, U-District, Vashon, Wallingford, West Seattle) — SLU is not yet
  covered by any of those or by `docs/source-candidates/seattle-farmers-markets.md`.

Sources:
- https://www.discoverslu.com/events/2026-slu-farmers-market-3/
- https://www.king5.com/article/money/business/small-business/south-lake-union-farmers-june-6-expanded-season-more-local-growers/281-d79dfee7-e7e4-4f9b-bdbf-5881f8113b7d
