---
name: "Sloop Tavern Yacht Club"
status: added
platform: "RSS (WildApricot)"
url: https://www.styc.org/calendar/RSS
tags: ["Sports", "Outdoors", "Ballard"]
firstSeen: 2026-09-08
lastChecked: 2026-09-08
pr:
---

Ballard-based recreational sailing club (est. 1976), racing and cruising
out of the Shilshole Bay area. Surfaced by going one level deeper on the
already-tracked `48-north-sarc.md` candidate: 48° North's regional race
calendar lists Sloop Tavern YC as the only Seattle-proper club in its feed
(the rest are out-of-scope per AGENTS.md), so its own dedicated calendar
was worth checking directly instead of trying to filter the regional feed.

Investigated 2026-09-08:
- Site runs on **WildApricot** (membership management platform). The
  `/calendar` page links a public RSS export at
  `https://www.styc.org/calendar/RSS` — confirmed live, valid RSS 2.0,
  11 items at time of check (7 public races/cruises + 4 internal "Board
  Meeting" items, filtered out as non-public content).
- WildApricot serializes an item's `<pubDate>` as **local midnight** when
  the organizer never set a specific time for the event (confirmed: every
  race/cruise item decodes to exactly 00:00 local, DST-adjusted correctly,
  while the recurring Board Meeting items decode to a consistent real
  18:00 local time). Implemented as a custom `IRipper` (not a built-in
  type — this project has no RSS ripper type) that treats local-midnight
  as "no time given" and pairs the event with an `UncertaintyError`
  (`startTime`, `duration`), following the events12/`docs/event-uncertainty.md`
  pattern, rather than publishing a guessed time as fact.
- No single fixed venue — races/cruises happen at various points around
  Puget Sound, occasionally at non-Seattle marinas (e.g. an October
  cruise to the Everett Marina). Used the club's home area (Shilshole Bay
  Marina, Ballard) for `geo` and a generic `"Puget Sound, Seattle, WA"`
  per-event location string rather than overclaiming precision.
- `ONLY_SOURCE=sloop-tavern-yacht-club npm run generate-calendars`: 7
  events, 0 parse errors, 7 uncertain (start time), 0 Nominatim calls
  (ripper-level geo applied directly). `npm run test`: all passing,
  including 25 new unit tests for the RSS parsing/uncertainty logic.

Implemented as `sources/sloop_tavern_yacht_club/` (PR pending).
