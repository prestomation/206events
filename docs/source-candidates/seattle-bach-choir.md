---
name: "Seattle Bach Choir"
status: added
platform: Tribe Events ICS
url: https://seattlebachchoir.org/events/
tags: [Music, Arts]
firstSeen: 2026-05-29
lastChecked: 2026-05-29
---

Discovered from a community poster board photo (Lake Forest Park / Third
Place Commons display) — the concert "a Martyr" (Florence Price's
*Abraham Lincoln Walks at Midnight*), Sun June 7 2026 3pm at Trinity
Parish Church, was not covered by any existing source.

WordPress site running **The Events Calendar (Tribe Events) v6.16.3**.
Working ICS feed at `https://seattlebachchoir.org/events/?ical=1` returns
a valid `VCALENDAR` with the full season — 4 future concerts (A Martyr,
Actus Tragicus, Requiem, Matters of Life & Death). Verified 2026-05-29:
`text/calendar`, 4 VEVENTs. The repo's external-ICS fetcher already sends
a desktop Chrome User-Agent, so the site's ModSecurity (which 406s on
bare UAs) is not a problem; no proxy needed.

Implemented as `sources/external/seattle-bach-choir.yaml`.
