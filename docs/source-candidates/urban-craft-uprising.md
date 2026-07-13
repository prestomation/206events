---
name: "Urban Craft Uprising"
status: candidate
platform: Custom HTML (WordPress)
url: https://urbancraftuprising.com/events/
tags: [MakersMarket]
firstSeen: 2026-07-13
lastChecked: 2026-07-13
---

Seattle's long-running (est. 2005) bi-annual indie craft show, ~150+
vendors per show. Historically at Magnuson Park Hangar 30 (Summer Show)
and Seattle Center Exhibition Hall (Winter Show); also lists smaller
markets like "Port Townsend Handmade Market", "Derby Days", "First Bite
Night", and "Gobble Up Seattle" on its events page.

Investigated 2026-07-13:
- Site is WordPress (`wp-content`/`wp-json` present), but only the
  built-in `post` type is exposed via the REST API (`wp-json/wp/v2/types`)
  — no `event`/`tribe_events` custom post type, so no structured API
- `/events/` page lists show names but no machine-readable dates (only
  vague "Summer"/"Winter 2026" labels on the landing page)
- No ICS feed or calendar export found
- Would require custom HTML scraping of individual event detail pages to
  get concrete dates/locations — 🔴 Low confidence tier. Worth
  implementing (repo has many custom scrapers) but lower priority than
  built-in-type candidates; needs a follow-up investigation of the
  individual event pages (e.g. `urbancraftuprising.com/ucu/`) for
  structured dates before implementation.
