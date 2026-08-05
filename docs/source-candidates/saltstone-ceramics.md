---
name: "Saltstone Ceramics"
status: candidate
platform: Shopify (custom scrape — no built-in Shopify ripper type exists yet)
url: https://saltstoneceramics.com/
tags: [Arts, Wallingford]
firstSeen: 2026-08-05
lastChecked: 2026-08-05
pr:
---

Ceramics studio in Wallingford. `/products.json` returns HTTP 200 with
50 products (confirmed via `curl`). The catalog is a mix of:

- Multi-week class series with the schedule baked into the title text,
  e.g. `"Fall Beginner Wheel: Wednesday Evenings, 6:30pm - 9:30pm,
  September 9th - October 28th"` (tag `class`, `adult-8-week`)
- Plain retail merchandise (mugs, bud vases, trays) that is not an event
  at all

Implementing this requires a **custom JSON scraper**, not the generic
Shopify pattern used elsewhere in the repo (no `shopify` ripper `type`
currently exists in `lib/config/`) — need to:
1. Filter to products tagged `class`/`workshop` (skip plain merch)
2. Parse the day-of-week + time range + start/end date out of the title
   string (no structured `event.start`/`event.end` fields in the Shopify
   product schema)
3. Decide whether a multi-week class series becomes one calendar entry
   or a recurring weekly entry for the series' date range

🟡 Medium-tier data source (Shopify `/products.json` confirmed live),
🔴 Low-tier effort (custom title parsing, class/merch filtering). Worth
implementing next cycle — Wallingford doesn't have many dedicated
sources yet.
