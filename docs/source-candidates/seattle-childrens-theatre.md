---
name: Seattle Children's Theatre
status: added
platform: Custom HTML (ticketing platform not identified)
url: https://www.sct.org
tags: [Theatre, Uptown]
firstSeen: 2026-08-14
lastChecked: 2026-09-06
pr: TBD
---

Seattle Center theater company producing plays for young audiences and families.

**Vetting notes (2026-08-14):** Real, well-established Seattle Center theater
company (box office (206) 441-3322). Confirmed live season page: 8
productions for the 2026-27 season running Oct 2026 - June 2027, with a
"Calendar" link under "Tickets & Shows" in nav. Ticketing/back-end platform
not identifiable from the fetched content (no Tessitura/AudienceView/Spektrix
branding visible); no ICS/API feed found. Would need a follow-up fetch of the
actual `/calendar` page and/or view-source inspection for a ticketing widget
that might expose structured data. Grepped `sources/` for "sct"/"children's
theatre" — only an unrelated string match in a test fixture, so not currently
covered.

**Implemented 2026-09-06:** The `/tickets-shows/calendar/YYYY/monthname/`
page is a server-rendered, purely static HTML calendar grid (no JS
rendering needed) — each day cell lists `mainstage`/`event`/`summer-show`/
`sct-class` entries with title, link, and a single start time; `sct-class`
entries (registration classes) are excluded as not one-off public events.
Each production's own detail page supplies `og:image`, `og:description`,
and a "Running Time" field used for duration (falls back to 90 min for
workshops/donor events that don't list one). Custom `HTMLRipper`-style
`IRipper` in `sources/seattle_childrens_theatre/`, fetching a rolling
6-month window. Verified 129 events, 0 errors via
`ONLY_SOURCE=seattle-childrens-theatre npm run generate-calendars`.
Venue: 201 Thomas St, Seattle, WA 98109 (OSM way 56817917).
