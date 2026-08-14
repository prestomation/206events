---
name: Seattles Child Calendar
status: candidate
platform: WordPress (Event Calendar Pro plugin)
url: https://www.seattleschild.com/calendar
tags: [Family, Media]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
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
