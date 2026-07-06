---
name: "Queen Anne Book Company"
status: added
platform: Custom HTML (Drupal / IndieCommerce events view)
url: https://qabookco.com/events
tags: [Books, QueenAnne]
firstSeen: 2026-07-04
lastChecked: 2026-07-06
pr: 865
---

Independent bookstore at 1811 Queen Anne Ave N, Seattle, WA 98109, beside
Queen Anne Coffee Company.

Investigated 2026-07-04:
- Site runs on IndieCommerce (Drupal, the American Booksellers Association's
  shared bookstore platform), not Squarespace/Eventbrite/any built-in type.
  `curl -sI` (HEAD) gets a `403` from the edge WAF, but a plain `GET` to
  `/events` succeeds (`200`) and returns real server-rendered event markup —
  no JS execution needed.
- `/events` page confirmed **4 upcoming dated events** for July 2026,
  including `QABC READS: "Murderland" by Caroline Fraser` (Tue 7/7/2026,
  6:00pm, at the store address). Each event is an `<article id="event-NN"
  class="event-list">` block with a date, time, title, tag(s), body summary,
  and a link to a per-event detail page (`/event/YYYY-MM-DD/<slug>`) that
  likely carries full structured details (time, place, description).
- Monthly recurring "QABC Reads" book club plus one-off author events (tag
  `queen-anne-ave-event` = in-store event; `online` = virtual events, which
  should be filtered out or geo: null'd separately if present).
- 🔥 High confidence for a **custom HTML scraper** — verified live event
  markup with real future dates, not a guess. Requires a per-event-page
  fetch (or the list page alone may have enough — the detail page wasn't
  checked) since the list page doesn't expose lat/lng, only a printed
  address which matches the store itself for in-store events.
- Not currently covered elsewhere in `sources/` or `sources/external/`.

Implemented 2026-07-06 (PR #865): custom HTML ripper at
`sources/queen_anne_book_company/`. The events list page alone had every
field needed (title, date, time, printed address) — no per-event detail-page
fetch was required. Verified 4 upcoming events locally with
`ONLY_SOURCE=queen-anne-book-company`. `geo: null` at the ripper level
(most events are off-site community promotions, not just in-store).
