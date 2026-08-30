---
name: Seattle Gay Scene
status: notviable
platform: WordPress
url: https://seattlegayscene.com
tags: [Queer, Media]
firstSeen: 2026-08-14
lastChecked: 2026-08-30
---

Seattle LGBTQ+ community media site covering events, nightlife, and queer culture.

**Vetting notes (2026-08-14):** Real, active WordPress site (confirmed
footer "proudly powered by WordPress") with recent posts (June-Aug 2026)
covering Pride events, drag, theater, and nightlife. A dedicated calendar
page exists at `seattlegayscene.com/calendar-2/` (not yet fetched directly —
check that page next, since it should be the actual implementation target
rather than the homepage). RSS feed confirmed at `/feed/`. Functions as an
aggregator (`sourceRole: aggregator`) covering many venues/orgs, not a single
venue. Not yet covered by any existing source.

**Follow-up (2026-08-30):** `seattlegayscene.com/calendar-2/` returns HTTP
404 — the linked calendar page no longer exists. Checked the WP REST API
(`/wp-json/wp/v2/types`) for a structured event post type: only `post`,
`page`, `attachment`, `nav_menu_item`, and `wp_block` are registered — no
`event`/`tribe_events` type. This is an editorial blog (posts about events),
not a structured calendar/feed source. `candidate` → `notviable`.
