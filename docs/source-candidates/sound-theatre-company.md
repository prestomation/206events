---
name: Sound Theatre Company
status: added
platform: OvationTix (built-in ripper)
url: https://soundtheatrecompany.org
tags: [Theatre, Arts]
firstSeen: 2026-08-14
lastChecked: 2026-08-20
pr:
---

Seattle theater company producing contemporary and experimental works.

**Implemented 2026-08-20:** config-only `ovationtix` source (client `36643`,
origin `https://soundtheatrecompany.org`). The OvationTix calendar API
(`https://api.ovationtix.com/public/calendar/client(36643)`) returns real dated
performances (14 events verified locally, currently "References to Salvador Dalí
Make Me Hot" running Oct 2026). STC is an itinerant company, so modeled like
`the_feast`: `geo: null`, no `venueAddress`, per-production ticket links. Tags
`Theatre`/`Arts` to match existing OvationTix theatre sources.

Confirmed live: WordPress site (`/wp-content/uploads/` paths) with productions organized
by season (current: "Illuminate: Disability Performance In The Spotlight", "References to
Salvador Dalí Make Me Hot", "Stream Changer: A Hand Telling"). Ticketing runs through
OvationTix and Stellar Tickets — this repo already has a built-in `ovationtix` ripper type
(see `taproot`); worth checking whether Sound Theatre Company has an OvationTix
`clientId`/`clientOrigin` the same way, which would make this a config-only addition. An
RSS feed exists at `/feed/` (WordPress default) but that's blog content, not a
structured show calendar. "Radical Inclusion" pricing tiers $5-$75.
