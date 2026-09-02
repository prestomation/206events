---
name: Seattle Artist League
status: added
platform: WordPress (WooCommerce)
url: https://www.seattleartistleague.com
tags: [Arts, Georgetown]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
pr:
---

Seattle arts organization offering classes, workshops, and community events for artists.

**Vetting notes (2026-08-14):** Real, active art education org in Georgetown.
Confirmed WordPress (`/wp-content/`). Site has a "Featured & Upcoming Classes"
section with specific start dates (e.g. 10/4, 10/26, 10/31) and a linked "All
Classes" page. No ICS/calendar feed or JSON API found — uses ActiveHosted for
its newsletter only. Would need HTML scraping of the classes listing. Not yet
covered by any existing source.

**Implemented 2026-09-02:** the site is WooCommerce, not a bespoke store —
its public "Store API" (`/wp-json/wc/store/v1/products?per_page=100`, used by
the site's own headless cart widgets, no auth required) returns the full
~85-product class catalog as JSON with no scraping needed. Start dates live
only in the free-text product title (e.g. "begins 10.28"); time and an
occasional off-site location live in inconsistent "Time:"/"Where:" bullets
inside `short_description`. Custom `JSONRipper` added at
`sources/seattle_artist_league/`: filters out Membership/Payment-Due
categories and ONLINE-titled classes (not physical Seattle events), parses
the trailing `M.D` date token from the title, and falls back to a
placeholder time + `UncertaintyError` when no `Time:` bullet is present.
Live build (`ONLY_SOURCE=seattle-artist-league`) confirmed 65 events, 17
pending time uncertainties, and 7 legitimate ParseErrors (gift certificates,
the certificate program, drop-in sessions, kits, independent study — real
catalog entries with no class date).
