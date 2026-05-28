---
name: "Northwest Asian Weekly Community Calendar"
status: added
platform: ExternalICS
url: https://nwasianweekly.com/community-calendar/?ical=1
tags: [Community, Arts]
firstSeen: 2026-05-28
lastChecked: 2026-05-28
pr: 420
---
**Northwest Asian Weekly Community Calendar** — External ICS (`https://nwasianweekly.com/community-calendar/?ical=1`) — AAPI community events calendar from the Pacific Northwest's leading Asian American newspaper.

Investigated 2026-05-28:
- Tribe Events WordPress plugin at `nwasianweekly.com/community-calendar/`
- `?ical=1` returns valid `text/calendar` ICS with 30 upcoming events
- Events include: Wing Luke Museum exhibitions, CID Spring Clean, Taiwanese Heritage Night, Pagdiriwang Philippine Festival, K-Fest, Tibet Fest, Live Aloha Hawaiian Cultural Festival, Summer Asian ArtsFest, and more
- Majority in Seattle (Wing Luke, Seattle Center Armory, T-Mobile Park, Hing Hay Park, Theatre Off Jackson, Central Library)
- Some events in Tacoma (Asia Pacific Cultural Center) and Bellevue — minority of calendar
- Multi-venue community calendar → `geo: null`
- Implemented as `sources/external/nw-asian-weekly.yaml`
