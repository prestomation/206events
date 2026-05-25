---
name: Beacon Hill Festival
status: added
platform: Recurring
url: https://parkways.seattle.gov/?s=beacon+hill+festival
tags: [Community, Beacon Hill, Parks]
firstSeen: 2026-05-25
lastChecked: 2026-05-25
---

Annual community festival hosted by Seattle Parks and Recreation at
Jefferson Park (3801 Beacon Ave S) on Beacon Hill. The 2026 edition is
themed "Hope on the Hill" and runs Saturday, June 6 from 11am-4pm.

Surfaced from a poster lookup (no existing source covered it). Search
of `events-index.json` for June 6 2026 + "Beacon Hill" / "Jefferson
Park" returned 0 matches, and the Seattle Parks blog
(`parkways.seattle.gov`) shows the festival has run every year on the
**first Saturday of June** since at least 2016:

- 2016: Jun 4 (24th annual)
- 2017: Jun 3
- 2018: Jun 2
- 2019: Jun 1
- 2024: Jun 1
- 2025: Jun 7
- 2026: Jun 6

Activities (per the 2026 poster and prior years' blog write-ups): live
music, talent show, art walk, kite making, bounce houses, food trucks,
plus free pottery / painting / gardening / self-defense classes.

The promoter is Seattle Parks & Recreation (contact
`paul.davenport@seattle.gov`, Jefferson Community Center
206-684-7481). Per the source-from-event rule for public-park venues,
the source is the **promoter / event series**, not the park itself.
Parks & Rec's general blog `parkways.seattle.gov` has no ICS or
structured event feed, and the festival is not on the seattle.gov
city-wide Trumba calendar either — so the cleanest fit is a recurring
entry rather than a scraper.

Added as `sources/recurring/beacon-hill-festival.yaml` with
`schedule: "1st Saturday"` and `months: [6]`.
