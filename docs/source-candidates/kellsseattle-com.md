---
name: MLB: PHI @ SEA
status: investigating
platform: Shopify (storefront) — events page platform unconfirmed
url: https://kellsseattle.com
tags: ["watching-sports"]
firstSeen: 2026-08-25
lastChecked: 2026-09-11
---

Discovered via aggregator gap analysis. 2 events in the Seattle
metro sample. Source domain: kellsseattle.com.

Sample event: "MLB: PHI @ SEA" (2026-08-25T01:40:00.000Z)
Description: Watch party at Kells for MLB: Philadelphia Phillies vs Seattle Mariners.

**2026-09-11:** Re-checked. The site's storefront runs on Shopify
(`/products.json` returns real data — merch only, no events), but the
`/events/` page's game-watch-party listings (e.g. the MLB sample above)
don't appear anywhere in the static HTML fetched in this environment —
likely a client-rendered sports-schedule app block. No confirmed data
endpoint found. Also a fairly low-value/low-distinctiveness content
type (recurring game watch-parties, largely interchangeable with any
other sports bar) even if a feed were found. Left as `investigating`.
