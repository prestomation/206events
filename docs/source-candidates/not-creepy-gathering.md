---
name: The Not Creepy Gathering
status: added
platform: Squarespace
url: http://www.thenotcreepygathering.com/upcoming-dates
tags: [Community]
firstSeen: 2026-08-14
lastChecked: 2026-08-30
pr: pending
---

Seattle social gathering event designed for meeting new people in a low-pressure environment.

**Findings (2026-08-14):** Strong candidate. Live page listing real dated events through
2026 at Seattle venues (Fremont Abbey, Ballard Homestead), plus Bellingham expansion events.
Ticketing is via **Humanitix** (events.humanitix.com), and each event exposes **Google
Calendar and ICS export links** directly on the page — this may be scrapable as a simple ICS
feed per event, or via Humanitix if it exposes an organizer API. Consistent "$10-$30 Sliding
Scale" pricing. Worth a closer look at whether Humanitix has a public organizer/host feed
similar to Eventbrite's `organizerId` pattern.

**Implemented 2026-08-30:** the `upcoming-dates` page itself turned out to be Squarespace
(`?format=json` returns `upcoming`/`past` arrays), not a Humanitix organizer feed — Humanitix
is just the ticketing platform linked from each post. Built a custom ripper
(`sources/not_creepy_gathering/`) that subclasses `SquarespaceRipper`: the structured
`location` field is a stale default (not a real address), so the venue, price, and
description are pulled from the freeform Squarespace post body instead. Bellingham events
(hosted at "Wink Wink") are filtered out to keep this source Seattle-focused — 2 live
Seattle events confirmed locally at Fremont Abbey as of 2026-08-30
(`ONLY_SOURCE=not-creepy-gathering npm run generate-calendars`).
