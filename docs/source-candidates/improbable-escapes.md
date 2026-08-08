---
name: "Improbable Escapes"
status: notviable
platform: Shopify
url: https://www.improbableescapes.com/
tags: []
firstSeen: 2026-08-08
lastChecked: 2026-08-08
pr:
---
Escape room + TCG/board game café in Seattle with a "Wonderland Events
Calendar" advertised on the homepage and a `/collections/events` nav link.
Investigated 2026-08-08: `/products.json` (verified, 200 OK) returns only
physical merchandise (TCG boxes, packs) — no event-type products or event
collection, same pattern as `mox-boarding-house-seattle.md`. The events
calendar is a custom-built widget embedded in the Shopify theme with no
discovered machine-readable feed (no ICS, no Tribe Events, no exposed
events API). Would require HTML scraping of a JS-rendered calendar widget;
not worth pursuing over higher-confidence candidates today.
