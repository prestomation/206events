---
name: "Paper Boat Booksellers"
status: added
platform: Squarespace
url: https://www.paperboatbooksellers.com/calendar/events
tags: ["Books", "West Seattle"]
firstSeen: 2026-08-25
lastChecked: 2026-09-02
pr: 1339
---

Independent bookstore in the West Seattle Junction (4522 California Ave
SW, Seattle, WA 98116) hosting weekly toddler/family reading time, several
monthly book clubs, a monthly book swap, and occasional community events
(author launches, a neighborhood wine walk).

Discovered via aggregator gap analysis. 2 events in the Seattle
metro sample. Source domain: paperboatbooksellers.com.

**Implemented 2026-09-02:** Re-investigated the aggregator-derived stub.
The sample URL's `/calendar/events/<slug>` path is the Squarespace event
detail pattern; the underlying collection lives at
`https://www.paperboatbooksellers.com/calendar/events` (the bare
`/calendar` page returns `itemCount: 0` — it's just a landing page, not
the events collection). Confirmed `?format=json` on `/calendar/events`
returns `collection.typeName: "events-stacked"`, `itemCount: 84`, with
**24 upcoming events** (`startDate` timestamps into December 2026),
each carrying a full street address (4522 California Avenue Southwest,
Seattle, WA 98116). Implemented via the built-in `squarespace` ripper
type (no custom code) — `sources/paper_boat_booksellers/ripper.yaml`.
Confirmed 24 events / 0 errors via
`ONLY_SOURCE=paper-boat-booksellers npm run generate-calendars`.
`geo` resolved via OpenStreetMap Nominatim (node 2397384462, matches the
venue's own "Paper Boat Booksellers" shop node). Not previously covered
under `sources/`.
