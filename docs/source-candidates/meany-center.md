---
status: added
pr: 705
---

Meany Center for the Performing Arts at the University of Washington. Presents world-class music, dance, and theater at Meany Hall on the UW campus.

**URL:** https://meanycenter.org/tickets/season
**Platform:** Drupal 7
**ICS feed:** None found
**Events:** ~25 productions per academic year (Oct–May), with multi-night runs (up to 3 nights) producing ~36 dated events

**Implementation notes:**
- Season listing at `/tickets/season` provides title, image, description per production
- Calendar view at `/tickets/events/calendar?date=YYYY-MM` exposes ISO 8601 datetimes in `span.date-display-single[content]` attributes
- Multi-day events appear as separate table rows each with unique datetime but same URL slug
- ID scheme: `meany-center-{slug}-{YYYYMMDD}` handles multi-day dedup
- Site is accessible from GitHub Actions (200 GET), no proxy needed
