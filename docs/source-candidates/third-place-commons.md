---
name: "Third Place Commons"
status: added
platform: Recurring (prose schedule)
url: https://www.thirdplacecommons.org/programs-events/farmers-market/
tags: [FarmersMarket, Community, "Lake Forest Park"]
firstSeen: 2026-05-29
lastChecked: 2026-05-29
---

Discovered from a community poster board photo (the board itself appears
to be at Third Place Commons / Lake Forest Park Town Center). NOTE: this
is the **Third Place Commons** nonprofit, distinct from the already-added
**Third Place Books** bookstore (`sources/third_place_books`, Eventbrite
organizer `30353358534`) — no overlap.

The site runs Tribe Events, but its ICS / REST feeds are effectively
broken for our purposes: every endpoint returns only stale 2024 "SMBG"
(Sunday Morning Breakfast Group) recurrences and ignores `start_date`
filtering. The marquee programming — the **Lake Forest Park Farmers
Market** — lives only in prose on a static page ("Sundays 10 AM – 2 PM,
Mother's Day through the third Sunday of October").

Captured the high-value, fully-predictable piece as a recurring entry:
`sources/recurring/lake-forest-park-farmers-market.yaml` (every Sunday,
months May–October). The broken Tribe ICS feed
(`?post_type=tribe_events&ical=1&eventDisplay=list`) can be revisited as
an external source if/when TPC starts publishing real dated live-music /
community events.
