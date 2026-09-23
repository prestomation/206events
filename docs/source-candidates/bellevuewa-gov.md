---
name: Dance Latin Fitness Class
status: added
platform: Unknown
url: https://bellevuewa.gov/events/dance-latin-fitness-class
tags: ["fitness", "dancing", "outdoors", "music"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 9 events in the Seattle
metro sample. Source domain: bellevuewa.gov.

Sample event: "Dance Latin Fitness Class" (2026-08-25T02:00:00.000Z)
Description: Join Saboco Dance Company for free outdoor Latin dance fitness classes all summer long at The Meadow (600 108th Ave NE).

**Checked 2026-09-23 (notviable):** Outside Seattle (City of Bellevue events, e.g. classes at The Meadow in downtown Bellevue).

**Re-evaluated 2026-09-23 (King County rule) -> added.** Bellevue is in King County. The Drupal 10 calendar has no ICS; its RSS (`/calendar/events.xml`) ignores the category filter, so added a custom HTML ripper over the filtered listing `https://bellevuewa.gov/calendar?cat=community-events&page=N` (paginated, ~10 cards/page). Listing dates omit the year; the ripper infers it from the stated weekday. "City Hall closed for ..." notices are skipped; date-only cards emit an UncertaintyError (startTime). New source: `sources/bellevue/` (name `bellevue`, calendar `community-events`, tags `Bellevue` + `Community`, `geo: null`, `sourceRole: venue`). 18 events in the local ONLY_SOURCE build (1 uncertain start time, 2 TBD-location geocode misses).
