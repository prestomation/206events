---
name: "Puget Sound Mycological Society"
status: added
platform: Custom HTML (MemberLeap association-management platform)
url: https://www.psms.org/all_events.php
tags: [Education, Outdoors]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
pr:
---

Seattle-based mushroom/mycology club — the largest in the country — running
free public ID clinics, monthly general meetings with guest speakers, an
annual Wild Mushroom Show, and paid multi-day forays.

Investigated 2026-09-16:
- `https://www.psms.org/all_events.php` is a server-rendered list of
  `<section class="feed-item">` cards, one per upcoming event, each linking
  to a `mms.psms.org/Calendar/moreinfo.php?org_id=PSMS&eventid=<id>` detail
  page (the MemberLeap association-management platform). No ICS/RSS export
  found, but each detail page embeds a clean schema.org `Event` JSON-LD
  block (name, startDate/endDate, Location with a full address, description)
  — no headless browser needed.
- Most public events (free Mushroom ID clinics, general meetings) are at the
  UW Center for Urban Horticulture, Seattle. The annual Wild Mushroom Show is
  at Shoreline Community College (Shoreline, just outside city limits) and
  the paid multi-day "Ben Woo Foray" is at Cispus Learning Center (Randle,
  WA) — both minority/occasional, same shape as other mostly-Seattle
  candidates with an out-of-town annual event.
- Internal club business (Board of Trustees meetings, a members-only holiday
  social) is filtered out before parsing — detected from the data itself
  (`Location.name === "Zoom"`, or "members only" in the name/description)
  rather than a guessed title prefix, so it still catches future internal
  listings worded differently.
- The Wild Mushroom Show and the multi-day Ben Woo Foray publish a date-only
  `startDate`/`endDate` (no time) — the real hours only appear as free text
  in the description ("Open to the public 12-6"), which isn't parsed to
  avoid guessing. Routed through the event-uncertainty system instead (noon
  placeholder + `UncertaintyError`), same pattern as `sloop_tavern_yacht_club`
  and `outdoors_for_all`.

Implemented as a custom `IRipper` (`sources/psms/`) — list page + per-event
JSON-LD detail fetch, modeled on the 8-Bit Brass Band ripper's sitemap +
per-page JSON-LD pattern. `sourceRole: venue` (first-party organizer of its
own program), `geo: null` (per-event geocoding — locations vary across three
different venues). Tags `Education`, `Outdoors`. 10 events, 0 parse errors,
3 non-fatal Uncertainty entries (the date-only listings), verified via
`ONLY_SOURCE=psms npm run generate-calendars`; full `npm run test` (3821
tests) and `npm run typecheck` both green.
