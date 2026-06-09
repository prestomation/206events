---
name: Museum of Flight
status: added
pr: 567
platform: Custom HTML (AJAX)
url: https://www.museumofflight.org/exhibits-and-events/calendar-of-events
tags: [Museums, Education, "Georgetown"]
firstSeen: 2026-06-09
lastChecked: 2026-06-09
---

Identified during poster lookup for SUMM "Math Out Loud" event (hosted at Museum of Flight).

- Events calendar at `/exhibits-and-events/calendar-of-events`
- Calendar data loads via AJAX from `/CMSAjax/CalendarListing` — returns rendered HTML, not JSON
- 6 unique upcoming events confirmed (science talks, film screenings, member events, family programming)
- Requires custom HTMLRipper — not Squarespace/Eventbrite/etc.
- Address: 9404 E. Marginal Way S, Seattle, WA 98108 (Georgetown/South Seattle area)
- AJAX endpoint returns clean structured HTML; should be parseable with CSS selectors
