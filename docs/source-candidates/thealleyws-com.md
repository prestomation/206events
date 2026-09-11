---
name: The Alley (West Seattle)
status: added
platform: Custom HTML (GoDaddy Website Builder) — implemented as sources/recurring/
url: https://thealleyws.com/resident-bands
tags: [Music, "West Seattle"]
firstSeen: 2026-08-25
lastChecked: 2026-09-11
pr: 1446
---

Small wine bar in West Seattle (4509 California Ave SW, Seattle, WA 98116)
with two weekly resident-band jazz nights, listed on a static
"Resident Bands" page (no ICS/JSON feed, no known ripper platform).

Investigated 2026-09-11:
- Confirmed live, server-rendered HTML page at `/resident-bands` listing
  two fixed weekly residencies with day/time/no-cover info:
  - **Sunday, 8-10pm**: DLux Jazz Trio ("rotating lineup of local
    musicians")
  - **Monday, 8-10pm**: Westside Jazz Trio (same trio "since 2023" —
    Bruce Barnard, Jeff Ferguson, Michael Olivola)
- The band name for the Sunday slot has already changed once (the
  aggregator-scraped sample from 2026-08-25 named "The Triangular
  Jazztet"; the live page now shows "DLux Jazz Trio") while the slot
  itself (Sunday Night Jazz, 8-10pm, no cover) is stable — modeled the
  event around the recurring slot/venue rather than pinning to the
  currently-booked band name, consistent with how other resident-band
  recurring entries in this repo are written.
- No ICS/JSON feed, no Squarespace/Wix/Eventbrite/Tribe markers — site is
  a GoDaddy Website Builder (DPS) static page. Not a good fit for a
  custom scraper given only 2 fixed weekly slots; implemented instead as
  two `sources/recurring/` entries (one per residency, since they have
  distinct names/descriptions), following the multi-file-per-venue
  pattern used by `half-moon-bouldering-*`.
- Address confirmed via the page footer ("In the Alley of 4509
  California Ave SW, Seattle, WA 98116"); geocoded via Nominatim (the
  OSM node at that address is tagged to a different business sharing
  the building, so no `osmId` was recorded).
- Implemented as `sources/recurring/the-alley-sunday-jazz.yaml` and
  `sources/recurring/the-alley-monday-jazz.yaml`.
