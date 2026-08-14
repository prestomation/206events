---
name: Sound Theatre Company
status: candidate
platform: WordPress + OvationTix/Stellar Tickets
url: https://soundtheatrecompany.org
tags: [Theater]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Seattle theater company producing contemporary and experimental works.

Confirmed live: WordPress site (`/wp-content/uploads/` paths) with productions organized
by season (current: "Illuminate: Disability Performance In The Spotlight", "References to
Salvador Dalí Make Me Hot", "Stream Changer: A Hand Telling"). Ticketing runs through
OvationTix and Stellar Tickets — this repo already has a built-in `ovationtix` ripper type
(see `taproot`); worth checking whether Sound Theatre Company has an OvationTix
`clientId`/`clientOrigin` the same way, which would make this a config-only addition. An
RSS feed exists at `/feed/` (WordPress default) but that's blog content, not a
structured show calendar. "Radical Inclusion" pricing tiers $5-$75.
