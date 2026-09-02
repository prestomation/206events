---
name: Salsa Vida Seattle
status: added
platform: Custom HTML (JSON-LD)
url: https://www.salsavida.com/guides/washington/seattle
tags: [Dance]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
pr:
---

Guide to salsa dancing events and venues in Seattle.

**Vetting notes (2026-08-14):** Real, live, actively-updated events guide —
confirmed 43 upcoming events in the next 30 days at check time, with specific
dates/times and named Seattle venues (Reverie Ballroom, Sea Monster Lounge,
Aurora Borealis). Site is a national guide (custom dynamic listing app, list
and calendar views, "Load More Events" pagination); this Seattle-filtered
guide page is the relevant slice. No explicit RSS/ICS feed link found in the
fetched content — would need HTML scraping or checking for an underlying JSON
API driving the "Load More" pagination. Functions as an aggregator
(`sourceRole: aggregator`) rather than a single venue. Not yet covered.

**Implemented 2026-09-02:** The guide page turned out to server-render a
single `<script type="application/ld+json">` block on first load — a
schema.org `ItemList` of 20 `Event` items, no browser/AJAX required. Each
item carries a real start/end time (with UTC offset), a full street address
with lat/lng, a price, and a description, so no separate geocoding or
card-scraping pass was needed (same shape DanceUS's JSON-LD-based rippers
already use). Implemented as `sources/salsa_vida_seattle` (custom
`IRipper`, `sourceRole: aggregator`, `geo: null`, tag `Dance` — no
precedent for a dedicated `Salsa`/`Dancing` tag in `lib/config/tags.ts`, so
reused the existing `Dance` tag). Filtered to `addressLocality === "Seattle"`
per the Seattle-focused quality gate — of the 20 items in the fetched
sample, 14 are Seattle-proper (Reverie Ballroom, Sea Monster Lounge, Salsa
Con Todo, Sueños de Salsa, Seattle Harbor Nightclub, Baila District,
Waterfront Park); 6 are Shoreline/Kent/Kirkland and are dropped. The page's
"Load More" button goes through a WordPress `admin-ajax.php` endpoint gated
by a per-page nonce — not pursued; the initial ~20-event/~2-week rolling
window is a clean, reliable source on its own and refreshes every build.
Verified live: `ONLY_SOURCE=salsa-vida-seattle npm run generate-calendars`
→ 14 events, 0 parse errors.
