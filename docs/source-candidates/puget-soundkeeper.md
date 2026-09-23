---
name: Puget Soundkeeper Marine Debris Cleanups
status: added
platform: WordPress
url: https://pugetsoundkeeper.org/volunteer/marine-debris-cleanups
tags: [Volunteering, Outdoors]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr: 1574
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

Re-checked 2026-09-16: `pugetsoundkeeper.org/events/` returns HTTP 403 from
this environment. Not stageable per the blocked-here rule; leaving as
`candidate` and re-testing next cycle.

2026-09-23: Re-checked: `pugetsoundkeeper.org/events/` and `/events/?ical=1` return HTTP 403, and `/wp-json/tribe/events/v1/events` returns a Sucuri CloudProxy JavaScript challenge ("Javascript is required"). A plain residential fetch gets the same challenge, so this would need the browserbase rung. The event volume is only about 3 cleanups a year, so it's not worth escalating. Marked blocked.

2026-09-23 (re-verified, verdict overturned): the 403 / Sucuri block is
**User-Agent-based**, not IP-based. A bot-style UA
(`Mozilla/5.0 (compatible; ...)`) gets 403 on every path, but a browser UA
(or plain `curl/8.0`) gets HTTP 200 on the Tribe ICS
`/?post_type=tribe_events&ical=1&eventDisplay=list` and on
`/wp-json/tribe/events/v1/events`. The build fetches external ICS with a
Chrome UA, so no proxy is needed. Volume is also far higher than the ~3/yr
first noted: 48 Tribe events in 2026 (kayak cleanups, creek restoration days,
the Sound Sweep series, Duwamish Alive, and more), mostly in Seattle/King
County, with a few partner cleanups elsewhere on the Sound. Added as
`sources/external/puget-soundkeeper.yaml` (geo: null, sourceRole: venue, tags
Volunteer/Outdoors); `ONLY_SOURCE=puget-soundkeeper` gave 7 upcoming events
and 0 errors.
