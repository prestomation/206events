---
name: Zulus Games Calendar
status: candidate
platform: Shopify
url: https://zulusgames.com/pages/calendar
tags: [Board-Games]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Seattle board game store hosting game nights, demos, and tabletop gaming events.

Real, live site, built on Shopify ("Integrated with BinderPOS", `/cdn/shop/
files/` asset URLs — try `?format=json` product/page endpoints per project
convention). Good volume: ~25-30 events visible on the calendar page (MTG
drafts/FNM/release parties, Flesh and Blood tournaments, Star Wars Unlimited
PAX West events, board game nights, D&D). Caveat: physical locations are
Bothell and Lynnwood, not Seattle proper — both fall inside/near this
project's geocoder bounding box (`city.config.ts`, up to 47.8N) and there's
precedent for similar-distance suburbs (e.g. `sources/recurring/
lake-forest-park-farmers-market.yaml`), so treating as Seattle-metro-adjacent
rather than excluding outright. Not already covered, not religious.
