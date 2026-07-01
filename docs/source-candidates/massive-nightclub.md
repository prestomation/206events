---
name: "Massive"
status: added
pr: 786
platform: Webflow (custom HTML scraper — JSON-LD + hidden date/time text)
url: https://www.massive.club/calendar
tags: [Nightlife, "Capitol Hill"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

**Massive** — `https://www.massive.club/calendar` — queer-focused nightclub at 619 E Pine St, Capitol Hill (three-floor venue, opened 2023). Hosts ticketed special events (drag, themed parties, touring DJs) on top of regular club nights.

Investigated 2026-07-01:
- Webflow site (Cloudflare-fronted). `/calendar` page is a static Webflow CMS collection list — plain fetch returns full HTML with no JS execution required.
- Each event card (`.event-item`) embeds a `script[type="application/ld+json"]` Schema.org `Event` block (name, image, Tixr ticket URL, price) plus a hidden `.infotext.hide` div with the exact human-readable date/time ("Jul 3, 2026 10:00 PM") — the JSON-LD `startDate`/`endDate` themselves are date-only (no time), so the hidden text is the source of truth for start time.
- Confirmed 6 upcoming events on initial fetch (through Oct 30, 2026), each with a Tixr ticket link and most with a price — `cost` is parsed directly from the JSON-LD `offers.price` field, no per-event uncertainty needed.
- No pagination/load-more markers found in the static HTML — the 6 events are the full near-term calendar of ticketed specials (regular open-club nights aren't modeled as dated "events").
- Geo confirmed via Nominatim: node 2158768961, 619 E Pine St, Seattle, WA 98122.

Implemented as `sources/massive/ripper.ts` (custom `IRipper`, single-page fetch, JSON-LD + node-html-parser for date/time correlation). Duration defaults to 4 hours (no end time on the page), consistent with other nightlife-venue rippers (`el_corazon`, `mopop`).
