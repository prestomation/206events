---
name: "Renton Civic Theatre"
status: added
platform: Payload CMS JSON API
url: https://www.rentoncivictheatre.org/shows/
tags: [Theatre, Renton]
firstSeen: 2026-05-29
lastChecked: 2026-06-02
pr: TBD
---

Discovered from a community poster board photo — "Footloose" (June 5-21
2026) plus the StoryBook Theater touring show "ME...Jane" both play here.

Custom Next.js + Payload CMS site. Clean public JSON at
`https://www.rentoncivictheatre.org/api/shows` (HTTP 200 from a plain
curl, CI-safe; 11 published docs with title/slug/description/dates).
Verified 2026-05-29.

**Blocker for clean implementation:** the API only exposes date *ranges*
(`openingDate`/`closingDate`), every timestamp pinned to `12:00:00Z` (a
date placeholder, not a curtain time). Per-performance showtimes live
only inside the Ludus ticketing widget, which is behind a Cloudflare JS
challenge (403 on all probes). So a ripper would either emit each show as
a multi-day all-day span, or route the unknown start time through the
**Event Uncertainty System** (`UncertaintyError` per `docs/event-uncertainty.md`)
rather than guessing noon.

Implemented 2026-06-02: JSONRipper fetching all shows from the Payload CMS
API. Each show emits one event at the opening date at 8:00 PM Pacific (a
reasonable community theatre default). Industry Night `otherDates` entries
also become separate events. Past shows (closingDate in the past) are
filtered out. Shows missing dates emit a ParseError. Image URLs from
`meta.image` are included.
