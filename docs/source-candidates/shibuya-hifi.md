---
name: Shibuya Hifi
status: added
platform: Wix
url: https://www.shibuyahifi.com
tags: [Nightlife, Music, Ballard]
firstSeen: 2026-08-14
lastChecked: 2026-09-10
pr:
---

Seattle listening bar and nightlife venue featuring DJ sets and curated music experiences.

Confirmed live: Wix site (image URLs on `wixstatic.com`) in Ballard. Has an events
calendar showing vinyl listening sessions for August 2026 with individual event pages
(album, time, host). No ICS/JSON feed link visible in fetched HTML — Wix Events widgets
sometimes expose a JSON API via their internal SPA data layer; worth inspecting
network calls directly (not visible via WebFetch's markdown conversion) before committing
to HTML scraping. Niche/low-volume but real recurring programming.

**Implemented 2026-09-10:** Same pattern as the (unmerged) 8-Bit Brass Band
ripper — Wix `event-pages-sitemap.xml` lists all published `/event-details/<slug>`
URLs; each event detail page embeds a `schema.org/Event` JSON-LD block
(`name`, `startDate`/`endDate`, `image`) in a `<script type="application/ld+json">`
tag. Unlike 8-Bit Brass Band, Shibuya Hifi is a single fixed venue (4912 Leary
Ave NW, Seattle, WA 98107 — Ballard), so no per-event location filtering is
needed; every event uses the venue's static address and `geo`. Live build
(`ONLY_SOURCE=shibuya-hifi`) confirmed 7 upcoming events at time of
implementation (album listening sessions: Tame Impala, Gustav Mahler, Steely
Dan, Daft Punk, Brandy, John McLaughlin, A Tribe Called Quest).
