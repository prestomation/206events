---
name: Seattles Child Calendar
status: added
platform: WordPress (Event Calendar Pro plugin)
url: https://www.seattleschild.com/calendar
tags: [Family, Media]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr:
---

Seattle's Child magazine family events calendar covering kid-friendly activities across the region.

Confirmed live: WordPress site running the Event Calendar Pro plugin (evidence:
`wp-content/plugins/event-calendar-pro/assets/images/icons/...` asset paths). Currently
showing ~250 dated results spanning August-September 2026 across the greater Puget Sound
area — dance/music, sports, festivals/fairs, farm and museum events, community-submitted.
No ICS/JSON feed link was visible in the fetched page; would need HTML scraping of the
calendar listing (an `HTMLRipper`), or check whether Event Calendar Pro exposes an
iCal export endpoint (common for this plugin, worth a follow-up check before writing a
parser). Aggregator-style source (`sourceRole: aggregator`), not Seattle-exclusive
(covers greater Puget Sound) but includes plenty of Seattle events — filtering by
location would likely be needed.

Implemented 2026-09-23 as custom ripper `sources/seattles_child/` (source name `seattles-child`, calendar `seattles-child-family-events`, `sourceRole: aggregator`, `geo: null`, tags Kids/Community). No feed exists (Event Calendar Pro plugin; `/wp-json/calendar/v1/events` rejects requests), so the ripper walks the `/calendar/page/N/` listing, fetches each one-off event's detail page and reads its schema.org Event JSON-LD (start/end time + postal address). Filters: prose-only recurring listings are skipped (their individual dates can't be reconstructed), only events whose `addressLocality` is Seattle are kept (the calendar covers all of Puget Sound), and spans >24h are skipped. Blank start times emit an UncertaintyError. `ONLY_SOURCE=seattles-child` build: 19 events, 0 parse errors (1 non-fatal geocode miss for "The Center for Wooden Boats, Lake Union"). About 60 requests per live fetch (12 listing pages + detail pages). This file is canonical over `seattles-child-events.md`, `seattles-child-summer-festivals.md` and `seattleschild-com.md`.
