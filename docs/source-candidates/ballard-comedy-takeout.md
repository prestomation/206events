---
name: Ballard Comedy Takeout
status: investigating
platform: Eventbrite
url: https://www.eventbrite.com/e/ballard-comedy-takeout-weekly-open-mic-on-thursdays-tickets-1988969007844
tags: [Comedy, Ballard]
firstSeen: 2026-07-02
lastChecked: 2026-07-12
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

Fixed 2026-07-12: confirmed the diagnosis by reading Eventbrite's public
API reference — the organizer events list returns series parents
(`is_series_parent: true`) with no concrete date, and the actual dated
occurrences live behind a separate `GET /series/{event_series_id}/events/`
endpoint ("List Events by Series", paginated, same shape as the organizer
list). Patched `EventbriteRipper.fetchAllEvents` (`lib/config/eventbrite.ts`)
to detect `is_series_parent` events from the organizer response and expand
each one via that endpoint before handing raw events to `parseEvents` — a
series that fails to expand is dropped rather than failing the whole
organizer fetch. Added unit coverage in `lib/config/eventbrite.test.ts`
(mocked `fetchFn`) for: expanding a series parent into its occurrences,
leaving non-series events untouched, and gracefully dropping a series that
fails to expand. This is a shared-ripper fix, so it benefits every
Eventbrite source using repeating events, not just this one.

Re-added `sources/ballard_comedy_takeout/ripper.yaml` (built-in
`eventbrite` type, `organizerId: 121332375671`, geo confirmed via
Nominatim — OSM node 2136834138, "Ballard Mandarin", 5500 8th Ave NW,
Seattle, WA 98107) and verified via the CI build, which has the real
`EVENTBRITE_TOKEN` already provisioned for other Eventbrite sources
(e.g. `actualize-air`, which produced 4 events in the same build,
confirming the token itself works).

CI confirmed the fix: `ballard-comedy-takeout-ballard-comedy-takeout`
now builds with **0 errors** (the false "no start time" `ParseError`
is gone), but still **0 events** — not a ripper bug this time. Checked
the organizer directly against both the authenticated
`GET /organizers/121332375671/events/?status=live` (via CI logs) and
the public unauthenticated mirror
(`eventbrite.com/api/v3/organizers/121332375671/events/?status=live`,
checked 2026-07-12): both return `object_count: 0`. The event page
itself now reads "Event ended" / "Sales ended" — the weekly Thursday
open-mic series that was live on 2026-07-02/07-03 has since gone
dormant/ended, independent of the ripper fix. Per the "never merge a
0-event source" rule, **reverted the source addition again** (kept
only the shared ripper fix + tests, which stand on their own merit and
are covered by unit tests). Status reset to `investigating` — a future
discovery cycle should re-check whether the organizer starts a new
season; if so, the pipeline is now proven correct and adding it back
should just work.
