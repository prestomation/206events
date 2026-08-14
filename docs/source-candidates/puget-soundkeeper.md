---
name: Puget Soundkeeper Marine Debris Cleanups
status: candidate
platform: WordPress
url: https://pugetsoundkeeper.org/volunteer/marine-debris-cleanups
tags: [Volunteering, Outdoors]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Puget Soundkeeper Alliance marine debris cleanup volunteer events around Puget Sound shorelines.

**Vetting notes (2026-08-14):** Real, live WordPress site. This specific page
is descriptive rather than a live listing — it names three annual recurring
cleanups (ETAP at Golden Gardens ~May, Lake Union Cleanup ~July 5, and an
International Coastal Cleanup with TBA dates) and points to a separate
"Events page" for registration/exact dates. Low event volume (roughly 3x/year)
but Seattle-area and legitimate. No ICS/API found on this page. Before
implementing, check `pugetsoundkeeper.org/events` (or similar) directly for a
scrapable listing, or consider modeling as a `sources/recurring/` entry given
the annual/seasonal cadence rather than a live ripper.
