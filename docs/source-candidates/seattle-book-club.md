---
name: "Seattle Book Club"
status: added
platform: Shopify app (Evey Events) — custom JSON API, not products.json
url: https://www.seattlebookclub.com/apps/events/calendar
tags: [Books]
firstSeen: 2026-07-10
lastChecked: 2026-09-15
pr: 1480
---

Independent Seattle bookstore/shop. Runs reading socials, author talks, and
book clubs at rotating Seattle venues (Backyard Bagel, Figurehead Brewing,
Hotel Sorrento, U Wine Bar, etc), alongside its retail catalog.

Investigated 2026-07-10:
- Confirmed Shopify (`cdn.shopify.com` assets), but `/products.json` only
  returns retail book inventory — no event data mixed in.
- The events calendar lives at `/apps/events/calendar`, a Shopify app page.
  The server-rendered HTML only contains unpopulated template placeholders
  (e.g. `${sourceEvent.location}`), confirming the actual event list is
  fetched and rendered client-side by the app's JS after page load — a
  plain HTML fetch returns no usable data.
- Did not find the underlying JSON endpoint the app calls (would need
  browser network-tab tracing; headless-browser probing in this environment
  hit `ERR_CONNECTION_RESET` through the sandboxed proxy, so this wasn't
  confirmed today).

Re-investigated 2026-09-15:
- A plain `curl` fetch of `/apps/events/calendar` (no browser needed) reveals
  the widget's inline FullCalendar `events` callback, which calls a public,
  unauthenticated JSON API directly: `GET
  https://api.eveyevents.com/production-v2/storefront/calendar?shop=<domain>&startDate=...&endDate=...&currentDate=...&lang=en`
  (shop domain read from a `Shopify.shop = "seattle-book-club.myshopify.com"`
  assignment elsewhere on the page).
- The response's top-level `events` array is raw/unfiltered product data
  (recurring listings keep their original stale start date); the `schedule`
  array is what the widget actually renders — `currentDate` filters it to
  future occurrences, and recurring listings are expanded into one entry per
  occurrence, but only within the queried `startDate`/`endDate` window (a
  September-only window never expands a listing's October occurrence). Needs
  the same several-month-loop approach as Seattle Blues Dance Collective.
- Confirmed 9 upcoming events live (2026-09-15 check) across genuinely
  Seattle-area venues: Figurehead Brewing (Fremont), Pure Barre (Green Lake),
  The Ladies Room (Greenwood spa), Cafe Bambino, A La Mode Pies (West
  Seattle), U Wine Bar (Wallingford), Hotel Sorrento (First Hill). Each
  occurrence carries a real ticket price (min/max), a product image, and an
  HTML description.
- Implemented as a custom `IRipper` (`sources/seattle_book_club/`), 14 events
  / 0 parse errors verified via `ONLY_SOURCE=seattle-book-club`. 12 of 14
  events geocoded cleanly; 1 (`Figurehead Brewing (Fremont)`) is a non-fatal
  geocode gap for the geo-resolver queue.
- `sourceRole: aggregator` (multi-venue), `geo: null`.
