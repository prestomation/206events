---
name: "Nook & Cranny Books"
status: investigating
platform: Eventbrite (currently inactive)
url: https://www.eventbrite.com/o/nook-cranny-books-110336549941
tags: ["Books", "University District"]
firstSeen: 2026-09-23
lastChecked: 2026-09-23
---

Independent bookstore at 5637 University Way NE Ste 102 (University District),
moved here in 2025 from a Capitol Hill location. Hosts monthly book clubs,
twice-monthly open-mic readings, and community/author events.

Investigated 2026-09-23:
- Public Eventbrite organizer page (`nook-cranny-books-110336549941`, id
  `110336549941`) looked live at first glance (search-engine snippet said
  "4 Upcoming Activities and Tickets"), so implemented as
  `sources/nook_and_cranny_books/` using the built-in `eventbrite` type. CI
  build produced 0 events (fatal gate for a new source — reverted from this
  PR, not merged).
- Root-caused the 0 events: every event/series on that organizer page —
  "Feel Like a Kid Again" Book Club (ended 2026-03-25), "The More You Know"
  Book Club (ended 2026-01-18), Spoken Word Open Mic (ended 2025-12-18), and
  the "Accelerated Growth Environment" pre-launch party (2026-02-22) — has
  `"status":"completed"` and an end date before today (2026-09-23). The
  organizer id is correct (verified via each event page's embedded
  `"organizer":{"id":"110336549941"}`); Eventbrite's own search-result
  snippet is just stale. The store's Eventbrite presence is not currently
  active — no new events have been posted there in months.
- Their own site (`nookandcrannybooks.com/events-calendar`) is a
  Weebly/Square "Editmysite" single-page app — no static HTML or JSON API
  for events, so it isn't a usable feed either right now.
- Re-evaluate later: if the store resumes posting live events to Eventbrite
  (check whether `?status=live` on the organizer events API returns >0), the
  `eventbrite` ripper config from this investigation can be reinstated as-is
  (organizerId `110336549941`, `5637 University Way NE Ste 102, Seattle, WA
  98105`, geo `47.6704387,-122.3133864` / OSM way `99808645`). If their own
  site's SPA ever exposes a JSON API, that would be worth a fresh look too.
