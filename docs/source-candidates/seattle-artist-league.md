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
the trailing `M.D` date token from the title (excluding session-length
decimals like "3.5 hour"), and falls back to a placeholder time/location +
`UncertaintyError` when no `Time:`/`Where:` bullet is present (including for
the small number of "@ The Brick" listings — a separate SAL-run space at a
different street address — that only mention it in the title). A product
whose title has no date token at all (gift certificates, the certificate
program, drop-in sessions, kits, independent study) is silently skipped
rather than reported as a ParseError — it's real store content, not a
malformed class, and `lib/calendar_ripper.ts`'s `newSourceParseErrors` gate
fails CI on any ParseError from a brand-new source. Live build
(`ONLY_SOURCE=seattle-artist-league`) confirmed 65 events, 0 ParseErrors, 5
pending time/location uncertainties (4 missing time, 3 missing an off-site
"@ The Brick" location, 2 overlapping both).
