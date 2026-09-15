---
name: "Nine Hats Wines"
status: added
platform: Custom HTML
url: https://ninehatswines.com/events
tags: [Wine, SoDo]
firstSeen: 2026-09-15
lastChecked: 2026-09-15
pr:
---

Sister wine label to Sleight of Hand Cellars (added earlier the same day),
sharing the same SODO Urbanworks tasting room at 3861 1st Ave S, Seattle,
WA 98134, but on a separate domain (`ninehatswines.com`) with its own
distinct programming (bingo, trivia, pizza-making classes, a monthly vinyl
swap, cult movie nights).

Investigated 2026-09-15:
- Not a Squarespace/known-platform site (Craft CMS + Vite build per
  response headers) — but the `/events` page server-renders its "Upcoming
  Events" grid directly into the HTML (confirmed via plain `curl`, no JS
  execution needed): each card is an `<li data-loop="false">` with a
  semantic `<time datetime="YYYY-MM-DD HH:MM:SSam/pm">`, an `<h3>` title,
  and a description `<div class="clamp-3">`.
- 5 upcoming events confirmed at time of check with real future dates
  (Sept 16 – Sept 30, 2026): Trivia Night, Pizza Making Class, Monthly
  Vinyl Swap, Social Club Open House + Mimosa Brunch, Terrarium Class.
- Not previously covered under `sources/` or `docs/source-candidates/`.
- Not a religious org.

Implemented as a custom `HTMLRipper` (`sources/nine_hats_wines/`). 5
events, 0 parse errors confirmed via `ONLY_SOURCE=nine-hats-wines` local
build.
