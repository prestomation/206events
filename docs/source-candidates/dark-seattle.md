---
name: "Dark Seattle"
status: added
platform: Custom HTML (hand-curated)
url: https://www.darkseattle.net/
tags: [Music, Nightlife]
firstSeen: 2026-09-17
lastChecked: 2026-09-23
---

Hand-curated multi-venue "dark, danceable music near Seattle" show
calendar (goth, industrial, darkwave, post-punk) covering Seattle-area
venues and a scattering of nearby cities (Tacoma, Everett, Shoreline,
Olympia).

Investigated 2026-09-17:
- Real, live, reachable page (HTTP 200, no bot-block observed). Content
  is server-rendered plain HTML — dated headers (`<br>Sat, May 23<br><br>`)
  followed by one `<div class="outlined">` per event (title, `<hr>`, a
  `<small>` block with time/venue, a ticket/details link, and optional
  free-text notes) — same overall shape as the already-implemented
  `nw_metal_calendar` (`sources/nw_metal_calendar`, aggregator sourced
  from nocleansinging.com), which already solves the "no year in the
  date string" problem via month-rollover inference relative to the
  fetch date.
- Spans roughly a full year of listings (Jan–Dec, ~250 date headers).
- Heavy cross-source overlap: most events are at venues already covered
  by their own dedicated sources in this repo (Kremwerk, Barboza, Baba
  Yaga, Rendezvous, Chop Suey, Substation, climate_pledge_arena-adjacent
  venues, etc.) — the cross-source-dedup system should in principle
  collapse these, but the volume of overlap (and some out-of-Seattle
  venues mixed in: Tacoma, Everett, Shoreline, Olympia) makes this a
  heavier custom scraper than a typical single-venue pick, and would
  need an allowlist/filter for Seattle-proper venues plus careful
  per-event dedup validation against many existing sources before
  merging.
- Some entries are recurring-series text embedded in a single date's
  listing (e.g. "Every other week May 17-Aug 22 and Sep 13-Oct 25")
  rather than one occurrence per date — would need a decision on
  whether to expand these or just publish the single listed occurrence.

Left as `investigating` — real and technically scrapable, but the
dedup/scope work needed pushes this to a future cycle rather than a
same-pass implementation.

**2026-09-23:** Implemented as custom HTML ripper `sources/dark_seattle/`
(source name `dark-seattle`, `sourceRole: aggregator`, `geo: null`). Parses the
live section of the single page (past listings sit in an HTML comment that the
parser drops), infers the year via month rollover (explicit `, 2027` headers
honored), expands range headers ("Thu, Nov 5 - Sun, Nov 8") to one event per
day, and skips listings whose venue carries a non-Seattle city suffix (Tacoma,
Olympia, Everett, White Center, Shoreline, Portland, OR, ...). "Time TBA"
listings emit a startTime `UncertaintyError`. Overlap with dedicated venue
sources is left to cross-source dedup (aggregator role). Verified: 111 events,
0 parse errors, 5 uncertainty entries, 4 non-fatal geocode misses.
