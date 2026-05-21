---
name: Pacific Place
status: added
platform: MallMaverick (custom JSON ripper)
url: https://pacificplaceseattle.com/events
tags: [Downtown, Community]
firstSeen: 2026-05-21
lastChecked: 2026-05-21
---

Five-level shopping center at 600 Pine Street, downtown Seattle. Hosts
its own programming (art markets, gallery exhibits, store-led events
like greeting-card Sundays and happy hours). Surfaced via a poster
lookup — an "Escala Owners Association" notification mis-titled their
**May Art Market** (May 22–24, 2026, in partnership with the Downtown
Art Walk) as "Seattle Art Fair", which sent the lookup into the wrong
neighborhood; the real source is Pacific Place itself.

The site is a Nuxt SPA fronted by `api.mallmaverick.com` (Taubman's
property-manager platform). Property id `790`, public API key in the
client JS bundle. Endpoint:

    https://api.mallmaverick.com/properties/790/events?api_key=6c36171ab3f3b2c5b734ac841bc078b4

Response is a flat JSON array, no pagination, no date parameters —
single fetch returns all upcoming + ongoing events. Verified 200 with
5 events on 2026-05-21.

The ripper filters out "ongoing forever" entries (`end_date: null` or
`no_end_date: true`) because they're recurring store specials with no
concrete next occurrence — they'd render as past-dated multi-month ICS
events. That leaves dated events (the art market, month-long gallery
exhibits, etc.); two events pass through from the current sample.
