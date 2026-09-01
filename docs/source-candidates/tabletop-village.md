---
name: Tabletop Village Tournaments
status: added
platform: Custom ripper (Google Calendar ICS, filtered)
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

**Implemented 2026-09-01,** through three iterations:

1. First attempt used three `sources/recurring/` entries derived from the Shopify
   tournament collection's product `body_html` text (Pokemon TCG Wed/Fri, Grand
   Archive TCG Sun, Beyblade Sun). Automated PR review (Amazon Q) flagged that
   Grand Archive and Beyblade both landed on "every Sunday 13:00" at the same
   venue — a real scheduling-conflict smell, symptomatic of guessing schedules
   from static blurb text instead of ground truth.
2. While investigating, found the store's own events page embeds a **public
   Google Calendar** (`calendar.google.com/calendar/embed?src=c_lk5nf8ne5ih2qtirija6h8vbqg%40group.calendar.google.com`)
   with a working public ICS export — 917 events total, real dated occurrences
   (not guessed weekly rules) going back to 2023. Replaced the three recurring
   entries with a plain `sources/external/tabletop-village.yaml` pointing at
   this feed.
3. A second review pass caught that the feed is the store's actual internal
   working calendar, not a curated public-events-only feed: alongside real
   programming it also carries posted store hours ("OPEN 11AM-8PM"), closure
   notices ("CLOSED"), and reference dates for Pokemon Regional Championships
   held in *other* cities ("REGIONAL: Nice", "REGIONAL: Frankfurt", etc.) — 32%
   of the events in the live build window were this kind of noise, all getting
   attributed to Tabletop Village and tagged `Gaming`/`International District`
   as if they were real Seattle events. The external-calendar pipeline has no
   per-event filtering hook, so replaced it with a small custom ripper
   (`sources/tabletop-village/ripper.ts`) that fetches the same ICS feed,
   expands recurring series (honoring RECURRENCE-ID overrides and EXDATEs via
   ical.js) up to 6 months out, and drops anything matching the noise title
   patterns before it's ever emitted. Verified against the live feed: 479
   events, 0 noise entries, 0 parse errors.

Geocoded via Nominatim: 47.5970231/-122.3221329 (616 8th Ave S, Seattle, WA 98104,
International District).
