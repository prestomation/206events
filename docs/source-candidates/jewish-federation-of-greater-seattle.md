---
name: "Jewish Federation of Greater Seattle"
status: candidate
platform: ICS (Tribe Events / The Events Calendar)
url: https://www.jewishinseattle.org/community-calendar/
tags: [Community]
firstSeen: 2026-07-03
lastChecked: 2026-07-03
pr:
---

**Jewish Federation of Greater Seattle Community Calendar** — city-wide secular community
calendar run by the Federation. The page explicitly states: "The Jewish Community Calendar
features public events hosted by local organizations and does not include religious
services" — so this is a secular community-org calendar, not a synagogue/worship feed.

Investigated 2026-07-03:
- Runs on The Events Calendar (Tribe Events) plugin for WordPress
- ICS export confirmed working: `https://www.jewishinseattle.org/community-calendar/?ical=1`
  returned HTTP 200 with **29 upcoming `VEVENT`s** (e.g. a Holocaust Center exhibit,
  Zumba/dance classes, a UW Pacific Connections Garden walking tour, a summer softball
  league) — a mix of cultural, educational, and community programming, not worship services
- 🔥 High confidence — verified ICS feed, ready for `sources/external/` as a standard ICS entry
