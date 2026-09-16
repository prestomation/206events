---
name: Do206 (Seattle events)
status: added
platform: Do206 (DoStuff Media network)
url: https://do206.com/
tags: ["Music"]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
pr:
---

Discovered via aggregator gap analysis. 27 events in the Seattle
metro sample. Source domain: do206.com.

Sample event: "TechCon 365 | DATACON | PWRCON" (2026-08-25T02:00:00.000Z)
Description: Tech conference at Seattle Convention Center covering Microsoft 365, Azure, Power Platform, and data. Runs Aug 24-28.

Investigated 2026-09-15:
- Do206 is Seattle's DoStuff Media property (same network behind do615,
  do904, etc.) — a concerts/comedy/culture aggregator for the wider Puget
  Sound metro, not Seattle-only.
- No API/ICS needed: `https://do206.com/events/{yyyy}/{MM}/{dd}` is a plain
  server-rendered day-listing page, and each event card carries full
  Schema.org microdata (`itemprop="name"`, `startDate` with a concrete
  offset, `location` → venue name/streetAddress/addressLocality/
  addressRegion/postalCode, and `geo` → exact latitude/longitude). No
  JS execution or JSON API required.
- An Algolia-backed search index (`events_search_production`) also backs
  the site, but the public API key can't be verified from this sandboxed
  environment (egress proxy blocks `algolia.net`) — not needed anyway
  since the day-listing HTML already has everything.
- Verified live: `addressLocality` is "Seattle" for ~24 of 25 sampled
  events on a spot-checked day; the rest (e.g. a McMenamins in Bothell)
  are filtered out by the ripper rather than skipped as a source, since
  the structured city field makes an exact per-event Seattle filter
  possible.
- Implemented as a custom `IRipper` (`sources/do206/`) that walks
  `lookahead` days (`P30D`), fetches each day's listing page, and parses
  the microdata directly — including lat/lng straight off the page
  (`geocodeSource: 'ripper'`, no Nominatim call needed for the common
  case). `sourceRole: aggregator`, `geo: null` (multi-venue).
- 694 upcoming events, 0 parse errors, verified via
  `ONLY_SOURCE=do206 npm run generate-calendars`. Expect meaningful
  cross-source duplicate overlap with existing venue-specific sources
  (Neumos/Barboza via AXS, STG venues, etc.) — that's expected for an
  aggregator and handled by the existing cross-source dedup + duplicate-
  resolver queue.
