---
name: "Smith Tower"
status: notviable
platform: WordPress (FareHarbor booking widgets, no events plugin)
url: https://www.smithtower.com/happenings/
tags: [Community, "Pioneer Square"]
firstSeen: 2026-09-17
lastChecked: 2026-09-17
---

Historic Pioneer Square skyscraper with a 35th-floor observatory/bar
themed as a 1920s speakeasy. Hosts seasonal programming (boozy brunches,
holiday soirées, cocktail classes, rooftop nights).

Investigated 2026-09-17:
- WordPress site (`/wp-content/themes/smith_tower/`), `/happenings/`
  page fetched directly (HTTP 200) — content is static category copy
  ("Spirits & Secrets: A Prohibition Halloween", "Boozy Afternoon Tea",
  "Cocktail Classes") with no dated per-occurrence listings in the
  static HTML.
- Individual bookable items are embedded FareHarbor widgets
  (`fareharbor.com/embeds/book/smithtower/items/<id>/calendar/...`) —
  these are more like ongoing bookable attraction slots (observatory
  tours, tastings) than one-off dated events, and would require
  reverse-engineering FareHarbor's availability API per item.
- No Tribe Events / The Events Calendar plugin, no ICS/RSS feed found.

Not viable as a scraped events source in its current form — no
structured, dated event listing to parse. Re-evaluate if the site adds a
real events collection/plugin.
