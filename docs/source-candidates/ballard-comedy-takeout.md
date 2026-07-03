---
name: Ballard Comedy Takeout
status: investigating
platform: Eventbrite
url: https://www.eventbrite.com/e/ballard-comedy-takeout-weekly-open-mic-on-thursdays-tickets-1988969007844
tags: [Comedy, Ballard]
firstSeen: 2026-07-02
lastChecked: 2026-07-03
pr:
---

Weekly comedy open mic at Ballard Mandarin (5500 8th Ave NW, Seattle, WA
98107), Thursdays 8:30 PM, hosted by Big Time Mel, free/21+. Verified via
the public Eventbrite organizer events API
(`eventbrite.com/api/v3/organizers/121332375671/events/?status=live`):
`organizerId: 121332375671`, 2 live upcoming dated events (Jul 2 and Jul 9,
2026) matching the weekly Thursday cadence. 🔥 High confidence — built-in
`eventbrite` ripper type, verified working organizerId.

Attempted 2026-07-03 in PR #838, reverted: `sources/ballard_comedy_takeout/ripper.yaml`
(built-in `eventbrite` type, `organizerId: 121332375671`) built and validated
locally (schema loads correctly under `ONLY_SOURCE`), but the CI build
produced 0 events + 1 parse error for this calendar on **two separate
build attempts** (not transient — first run and a `rerun_failed_jobs`
retry both failed identically), while the sibling Eventbrite source
`actualize-air` in the same build runs succeeded with real events,
confirming the shared `EVENTBRITE_TOKEN` secret itself is valid and working.

No HTTP error text (`Eventbrite API error`, `Failed to fetch Eventbrite`)
appeared in either CI log — meaning the fetch itself succeeded and returned
data, but `EventbriteRipper.parseEvents` generated exactly one per-event
`ParseError` and zero output events. The Eventbrite organizer page shows
this event as `"is_series": true` (a recurring weekly series with a
`series_id`). Eventbrite's private Developer API (`eventbriteapi.com/v3`,
what the built-in ripper authenticates against) is documented to return
only the **series parent** object from `GET /organizers/:id/events/` for
recurring events — the parent has no concrete `start`/`end`, which would
trip the ripper's "No start time for event" per-event ParseError and
explain 0 output events. The **public, unauthenticated** mirror
(`www.eventbrite.com/api/v3/...`, used for manual verification since we
have no token here) does NOT reproduce this — it always resolves to the
occurrence-level event with a concrete date — so this discrepancy could
not be confirmed against the real authenticated endpoint from this
environment.

**This looks like a real gap in the shared `EventbriteRipper`** (`lib/config/eventbrite.ts`)
for organizers who use Eventbrite's recurring/repeating-event ("series")
feature, rather than a problem specific to this venue. Fixing it would
need `expand=series` or a follow-up `GET /series/:id/events/` call, but
should be verified against the real `EVENTBRITE_TOKEN` (e.g. from the
out-of-band environment or by whoever holds the token) before changing
shared ripper code, since the public mirror can't reproduce the bug.
Reverted the source addition rather than merge with 0 events. Revisit
either by testing the series-expansion fix with real token access, or by
re-checking after the org posts a non-recurring one-off event.
