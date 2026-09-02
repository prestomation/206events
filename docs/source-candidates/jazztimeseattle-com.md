---
name: Jazztime Seattle
status: added
platform: Custom recurring (weekly Lindy Hop / swing dance nights)
url: https://www.jazztimeseattle.com/weekly-swing-dance-events-seattle
tags: ["Dance", "Ravenna"]
firstSeen: 2026-08-25
lastChecked: 2026-09-02
pr:
---

Lindy Hop / swing dance studio in Seattle's Ravenna neighborhood (5751 33rd
Ave NE), part of the citywide swing-dance scene.

Discovered 2026-08-25 via aggregator gap analysis (2 events in the Seattle
metro sample, sourced from `jazztimeseattle.com`).

Investigated 2026-09-02: the site (Squarespace) has no dedicated
Events-collection JSON feed, but its "Weekly Events" page
(`/weekly-swing-dance-events-seattle`) advertises two clean, stable weekly
recurring nights:

- **Tuesday Community Night** — every Tuesday, 8:30-10:45 PM, $10 entry
  (community practice + free instructor coaching during the first hour).
- **Thursday Night Swing Dance** — every Thursday, 8:30-10:45 PM, $15 entry
  (DJ or live band, partner rotation). Occasional special-themed nights
  (contests, fundraisers) still land on the regular Thursday slot.

Fits the `sources/recurring/` model directly — no scraping needed. Because
the two nights have different names/pricing (unlike a single market open
two days), implemented as two separate files rather than one multi-schedule
entry: `sources/recurring/jazztime-seattle-tuesday-community-night.yaml` and
`sources/recurring/jazztime-seattle-thursday-night-swing.yaml`
(`sourceRole: venue`, tags `Dance`/`Ravenna`). Geo resolved via OSM Nominatim
(way 220917045, 5751 33rd Ave NE — a shared building also used by a
community org; Jazztime itself is a secular dance studio). 1 event each
confirmed via `ONLY_SOURCE=jazztime-seattle-tuesday-community-night,jazztime-seattle-thursday-night-swing
npm run generate-calendars`.

Jazztime Seattle also appears as an event within the existing DanceUS
Seattle Swing Calendar aggregator (`sources/danceus_swing`, PR #1337); the
venue-direct source here outranks the aggregator copy under the standard
cross-source dedup rules once both list the same occurrence.
