---
name: Folk Dance Page Calendar
status: added
platform: ICS Feed (custom, city-filterable)
url: https://www.folkdance.page/calendar?date=all
tags: [Dance, Folk]
firstSeen: 2026-08-14
lastChecked: 2026-08-15
pr: PENDING
---

Comprehensive calendar of folk dance events including contra, English country, and international folk dancing.

Verified 2026-08-14: **strong pick**. The site publishes a working ICS
feed at `/index.ics?date=all` and honors the same filter query params as
the HTML calendar. Confirmed by direct fetch:
`https://www.folkdance.page/index.ics?date=all&country=USA&city=Seattle`
returns a valid `VCALENDAR` (`PRODID:ICALENDAR-RS`) with **333 VEVENTs**
for Seattle — proper `DTSTART`/`DTEND`/`LOCATION`/`SUMMARY`/`DESCRIPTION`
fields, categorized by dance style (Scandi, contra, English country,
international, etc). This should be a simple `sources/external/` ICS
entry (global page but the `city=Seattle` filter param scopes it). Not
found under `sources/`.

**Implemented 2026-08-15:** Added `sources/external/folkdance-page.yaml`
(`geo: null`, `sourceRole: aggregator`, tags `Dance`/`Folk` — used `Dance`
instead of `Dancing` to match the canonical tag spelling already in
`lib/config/tags.ts`). Re-verified the feed live: 333 total VEVENTs, 18
with future `DTSTART` (16 surfaced in the near-term tag aggregates at
build time). `ONLY_SOURCE=folkdance-page npm run generate-calendars`
confirmed 0 errors and correct tag aggregation.
