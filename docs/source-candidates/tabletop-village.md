---
name: Tabletop Village Tournaments
status: added
platform: ICS (Google Calendar)
url: https://tabletopvillage.com/collections/tournament
tags: [Gaming]
firstSeen: 2026-08-14
lastChecked: 2026-09-01
pr: 1327
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

**Implemented 2026-09-01:** first attempt used three `sources/recurring/` entries
derived from the Shopify tournament collection's product `body_html` text (Pokemon
TCG Wed/Fri, Grand Archive TCG Sun, Beyblade Sun). Automated PR review (Amazon Q)
flagged that Grand Archive and Beyblade both landed on "every Sunday 13:00" at the
same venue — a real scheduling-conflict smell that turned out to be a symptom of
using static blurb text instead of ground truth. While investigating, found the
store's own site embeds a **public Google Calendar** (`calendar.google.com/calendar/
embed?src=c_lk5nf8ne5ih2qtirija6h8vbqg%40group.calendar.google.com`) with a working
public ICS export (`.../ical/c_lk5nf8ne5ih2qtirija6h8vbqg%40group.calendar.google.com/
public/basic.ics`) — 917 events total, 59 upcoming at check time, real dated
occurrences (not guessed weekly rules) going back to 2023. Per the "ICS feed is the
best case" priority order, replaced the three recurring entries with a single
`sources/external/tabletop-village.yaml` pointing at this feed — resolves the
scheduling-conflict concern outright (no more guessed recurring rules) and picks up
every event type on the calendar (weekly tournaments, release events, championship
qualifiers), not just the three tournaments visible on the product-collection page.
Geocoded via Nominatim: 47.5970231/-122.3221329 (616 8th Ave S, Seattle, WA 98104,
International District).
