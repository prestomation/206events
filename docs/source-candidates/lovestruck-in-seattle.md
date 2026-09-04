---
name: "Lovestruck in Seattle"
status: candidate
platform: Eventbrite
url: https://www.lovestruckinseattle.com/pages/events
tags: [Books, Wedgwood]
firstSeen: 2026-09-04
lastChecked: 2026-09-04
pr: 1369
---

Queer- and woman-owned romance-only indie bookstore, first pop-up in July
2025 and permanent storefront since October 2025 at 8507 35th Ave NE,
Seattle, WA 98115 (Wedgwood).

Investigated 2026-09-04:
- Site runs on Shopify; the `/pages/events` page has no dated event data
  itself, but links out to an Eventbrite organizer:
  `https://www.eventbrite.com/o/112498075441`.
- Verified via the public Eventbrite API
  (`eventbrite.com/api/v3/organizers/112498075441/events/?status=live`):
  `organizerId: 112498075441`, **11 live upcoming events** at time of
  check (e.g. "ACOTAR 6 Release Day Party" Oct 27, "Knotty Night Book
  Event" Sep 4), none flagged `is_series`/`is_series_parent`.
- 🔥 High confidence — built-in `eventbrite` ripper type, verified
  working organizerId with real dated occurrences.
