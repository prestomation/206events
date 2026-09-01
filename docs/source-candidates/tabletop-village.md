---
name: Tabletop Village Tournaments
status: added
platform: Shopify
url: https://tabletopvillage.com/collections/tournament
tags: [Gaming]
firstSeen: 2026-08-14
lastChecked: 2026-09-01
pr: TBD
---

Seattle tabletop gaming organization / game store (616 8th Ave S, Seattle, WA 98104,
per-site listed address) hosting board game and TCG tournaments and events.

Confirmed live: Shopify storefront (cart/product-listing indicators, standard Shopify
`/collections/` URL structure — `/collections/tournament.json` and `/products.json`
should both be reachable per Shopify's default JSON endpoints, worth confirming before
implementing). Verified recurring tournaments: "Pokemon TCG: Weekly Tournament"
(Wed & Fri 6pm), "Grand Archive TCG: Weekly Tournament" (Sun 1-4:30pm) — mostly TCG
(Pokemon/Magic-style) rather than traditional board games despite the "Tabletop Village"
name. Low-moderate volume but real and Seattle-based (SODO/Pioneer Square area).

**Implemented 2026-09-01:** the Shopify collection's product `body_html` for each
tournament spelled out a fixed weekly day/time pattern (no bounded course dates), so
this fit the `sources/recurring/` model better than a custom Shopify ripper — no code
needed. Added three entries: `tabletop-village-pokemon-tcg` (every Wed & Fri, 6pm,
$15 door/$10 member), `tabletop-village-grand-archive-tcg` (every Sun, 1-4:30pm, free),
and `tabletop-village-beyblade` (every Sun, 1-5pm, free — found on the same collection
page, not previously noted). Geocoded via Nominatim: 47.5970231/-122.3221329 (616 8th
Ave S, Seattle, WA 98104, International District). The "Magic TCG: Regional
Championship Qualifiers" product was skipped — it's a dated seasonal series, not a
stable weekly pattern.
