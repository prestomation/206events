---
name: "Metro Seattle Gamers"
status: added
platform: Wild Apricot (RSS)
url: https://www.metroseattlegamers.org/events
tags: [Gaming, Interbay]
firstSeen: 2026-08-25
lastChecked: 2026-09-17
pr:
---

Board/strategy/war-gaming club with a single physical clubhouse (Nickerson
Marina Building, Suite 301, 1080 W Ewing Pl, Seattle, WA 98119 — Interbay).

Originally surfaced 2026-08-25 via aggregator gap analysis pointing at a
single event page (`event-6284500`, "World in Flames").

**Investigated 2026-09-17:** the site runs on Wild Apricot, the same
platform as the already-implemented `sources/sloop_tavern_yacht_club/`. Its
public events RSS (`https://www.metroseattlegamers.org/RSS`) returns 237
upcoming items — weekly/biweekly game nights (Euros, wargames, RPGs) plus a
handful of internal-only items ("Q3 Board Meeting", "Club Annual General
Meeting (AGM)"). Confirmed via Nominatim that the clubhouse address
(1080 W Ewing Pl) resolves to the "Nickerson Marina" OSM node (47.6557167,
-122.3698330) in Seattle's Interbay neighborhood — genuinely Seattle-proper.

One platform quirk not present in the STYC feed: WildApricot gives every
occurrence of a recurring event series the **same guid/link** (e.g.
"Thursday night Euros" reuses `event-5049756` across many Thursdays) — the
guid identifies the series, not the occurrence. Ids are built as
`metro-seattle-gamers-<seriesId>-<localDate>` to keep them unique per
occurrence rather than colliding.

**Implemented 2026-09-17:** custom `IRipper` at `sources/metro_seattle_gamers/`
(RSS parsing adapted from `sources/sloop_tavern_yacht_club/`), `sourceRole:
venue`, fixed `geo` (OSM node 2190510379), `lookahead: P3M` to keep the feed
to a near-term window rather than the raw feed's multi-year horizon, filters
out board-meeting/AGM items via a non-public-title substring check. Verified
with `ONLY_SOURCE=metro-seattle-gamers npm run generate-calendars` — 74
events, 0 errors.
