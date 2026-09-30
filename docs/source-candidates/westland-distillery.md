---
name: "Westland Distillery"
status: candidate
platform: Shopify (ticketed-events collection)
url: https://westlanddistillery.com/pages/distillery-events
tags: [SoDo]
firstSeen: 2026-09-30
lastChecked: 2026-09-30
---

Whiskey distillery and tasting room at 2931 1st Ave S, SoDo, Seattle
(King County). The `/pages/distillery-events` page is a Shopify age-gate
splash shell with no server-rendered event content; actual ticketed
events live in the `/collections/ticketed-whiskey-events` Shopify
collection.

Verified via `?format=json`/`products.json` per the built-in `shopify`
ripper's quality-gate check: `/collections/ticketed-whiskey-events/products.json`
returned HTTP 200 with `{"products":[]}` — 0 products/events at time of
check. Per the "200 + 0 events" rule, do not implement yet. Re-check the
same URL next cycle; if it returns upcoming ticketed products, this is a
🔥 High-confidence `shopify`-type candidate (verified endpoint, no custom
scraper needed).
