---
name: Wayward Music Series (WordPress site)
status: added
platform: WordPress REST API
url: https://www.waywardmusic.org/
tags: [Music, Arts, Wallingford]
firstSeen: 2026-05-20
lastChecked: 2026-05-20
pr: TBD
---

Implemented 2026-05-20 as `sources/wayward_music/ripper.ts`. Uses the WordPress
REST API (`/wp-json/wp/v2/posts?categories=1`) to fetch upcoming events from the
`Event` post category. The WordPress post `date` field stores the actual event
datetime in local time (America/Los_Angeles). 14 upcoming events confirmed at
implementation time.

The WordPress site includes events not ticketed through Eventbrite (the existing
Nonsequitur source covers ~2 overlapping events with "NonSeq:" prefix). The
additional events are free/donation concerts by the same venue.
