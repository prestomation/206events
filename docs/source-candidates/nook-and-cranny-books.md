---
name: "Nook & Cranny Books"
status: added
pr: 1569
platform: Eventbrite
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
  `110336549941`) confirmed live and showing "4 Upcoming Activities and
  Tickets".
- Their own site (`nookandcrannybooks.com/events-calendar`) is a
  Weebly/Square "Editmysite" single-page app — no static HTML or JSON API
  for events, so Eventbrite is the only usable feed, not the site itself.
- 🔥 High confidence — built-in `eventbrite` type, organizer confirmed live.
- Implemented as `sources/nook_and_cranny_books/` (no `proxy:` — most
  Eventbrite sources in this repo fetch fine from CI directly; will stage
  for proxy testing only if CI blocks it).
