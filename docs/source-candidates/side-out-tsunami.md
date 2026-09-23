---
name: "Sideout Tsunami Pickleball Center"
status: added
pr:
platform: Custom (JSON-LD, Next.js SSR)
url: https://sideouttsunami.com/events
tags: [Sports, "Mount Baker"]
firstSeen: 2026-09-23
lastChecked: 2026-09-23
---

Seattle's largest indoor pickleball facility (26 courts, including 3
championship courts), 2300 26th Ave S, Seattle (Mount Baker neighborhood,
in a former Pepsi Bottling Group industrial building). Court booking,
open play, leagues, clinics, and tournaments; open to the public, no
membership required.

Investigated 2026-09-23:
- Found via a "Seattle pickleball open play schedule" search.
- `/events` is a Next.js SSR page that server-renders real
  `schema.org/SportsEvent` JSON-LD directly in the HTML (alongside
  `SportsActivityLocation`/`BreadcrumbList` blocks) — no JS rendering
  needed, just a plain fetch.
- Confirmed 50 upcoming `SportsEvent` entries at time of check, spanning
  today (2026-09-23) through mid-October: drop-in classes ("Pickleball
  101", "Novice Skills & Drills"), leagues ("Silly Pickles Fall League",
  "Swish Leagues", "KC Pickleball League"), clinics ("The Pickleball
  Progression" series with Devin Schmidt, "3 & Me" with Noah Zwiren), and
  tournaments ("Anniversary Tournament", "Paddles for a Purpose" charity
  tournament for Treehouse for Kids).
- Each event links to a CourtReserve booking page carrying a stable
  per-occurrence id (`reservationId=` or `resId=` query param depending
  on the link shape) — used as the event id.
- The venue's own JSON-LD gives exact coordinates
  (`lat: 47.5806, lng: -122.297`); cross-checked against an OSM building
  match (`osmType: way`, `osmId: 194421327`, same address) and used the
  OSM-anchored coordinate pair for consistency with the rest of the geo
  data.
- "Mount Baker" was not yet a registered neighborhood tag — added to
  `city.config.ts`'s `neighborhoods` list in the same PR.
- No price data in the JSON-LD (`offers` present for classes but without
  a `price` field, absent entirely for leagues/tournaments) — `cost` left
  unset (unknown) rather than guessed.
- 🔴 Low-confidence tier (custom JSON-LD scraper, no built-in ripper type
  fits), but high-certainty data once found — a real structured feed, not
  a guess. Implemented as `sources/side_out_tsunami/`. Verified via
  `ONLY_SOURCE=side-out-tsunami npm run generate-calendars`: 50 events,
  0 errors, 0 geocode errors. Full `npm run test`: 3976 tests, 227 files
  green.
