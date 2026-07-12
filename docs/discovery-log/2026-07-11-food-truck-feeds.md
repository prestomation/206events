## Food-truck feed sweep — per-truck schedule harvest (Phase 1)

Part of the food-truck attribution effort (`docs/food-truck-attribution.md`).
Swept the full 831-truck roster (`docs/seattle-food-trucks-roster.md`): pulled
each truck's `website` from the SeattleFoodTruck.com API (519 of 831 had a real
site, the rest social/Linktree/none), then probed every website for a
machine-readable dated feed — Squarespace Events (`?format=json` → `upcoming[]`)
and embedded Google Calendar / ICS / Tribe-Events (`webcal://…?ical=1`) feeds,
homepage + common schedule subpaths. Every feed below was confirmed live with
≥1 dated event on/after 2026-07-12.

**Result: ~10 trucks citywide have a usable feed** (Tat's + Where Ya At Matt,
already added, + the 8 below). This confirms the design doc's finding that a
self-published feed is rare (~1%), and bounds feed-based per-truck coverage.

- ✅ Added: **Split Open and Melt** — Squarespace Events
  (`melt-co.com/events-2-1?format=json`, 81 upcoming) — `sources/split-open-and-melt/` (`type: squarespace`).
- ✅ Added: **Good Morning Tacos** — Squarespace Events — `sources/good-morning-tacos/`.
- ✅ Added: **Dippy's Delicious Ice Cream** — Squarespace Events (low volume, 1 upcoming) — `sources/dippys-ice-cream/`.
- ✅ Added: **Trio Truck** — Google Calendar ICS — `sources/external/trio-truck.yaml`.
- ✅ Added: **Sunn Health Bar** — Tribe Events ICS (`?post_type=tribe_events&ical=1`) — `sources/external/sunn-health-bar.yaml`.
- ✅ Added: **Taco Cortes** — Google Calendar ICS (site `tacoexpressfoodtruck.com`) — `sources/external/taco-cortes.yaml`.
- ✅ Added: **Tummy Yummy** — Google Calendar ICS — `sources/external/tummy-yummy.yaml`.
- ✅ Added: **Thai-U-Up** — Google Calendar ICS — `sources/external/thai-u-up.yaml`.

All tagged `["FoodTruck"]`, `sourceRole: venue`, `geo: null` (itinerant — a
truck's own feed is not geo-filtered). Verified via scoped `ONLY_SOURCE` build.

- ❌ Not viable: **Wicked Good Grinders** — Google Calendar ICS is live but its
  last event is 2019 (dead feed).
- ❌ Not viable: **The Seattle Barkery** — Tribe feed returns 0 events; already
  an existing source (the `expectEmpty` example).

**Method note for future sweeps:** most truck sites embed the *legacy*
`www.google.com/calendar/embed?...src=<id>%40group.calendar.google.com` form
(JSON-escaped `\/`, `&amp;amp;` entities) rather than `calendar.google.com`;
un-escape the HTML, match both hosts, and rebuild as
`https://calendar.google.com/calendar/ical/<src>/public/basic.ics`. Tribe-Events
feeds surface as `webcal://<site>/?post_type=tribe_events&ical=1&eventDisplay=list`
(swap `webcal://`→`https://`).
