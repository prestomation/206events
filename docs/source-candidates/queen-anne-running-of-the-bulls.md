---
name: "Queen Anne Running of the Bulls"
status: added
platform: Recurring (hand-coded, no ICS/API/self-hosted calendar)
url: https://everout.com/seattle/events/queen-anne-running-of-the-bulls/e81328/
tags: [Running, Community, QueenAnne, Outdoors]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
pr:
---

Whimsical annual footrace down Queen Anne Ave N, Pamplona-style: runners in
white with red scarves are "chased" by decorated shopping-cart "bulls" from
the Queen Anne Ave N business district to Kerry Park. Organized by the
"Comstock Commission, a division of the Queen Anne Mafia" — a joke secret
society with no dedicated website, ICS feed, or API. 2026 is the 16th annual
running (Saturday, July 11, 2026, noon).

Investigated 2026-07-11 (user request: "find and add a source for Queen Anne
running of the bulls"):

- Checked production data first (`skills/event-lookup`) — the event was not
  in `events-index.json`. Queen Anne Book Company (`sources/queen_anne_book_company`)
  already lists this event on its own community events page
  (`qabookco.com/event/2026-07-11/queen-anne-running-o-bulls`), but the 2026
  instance hadn't surfaced in a build — no `ParseError` for the source in
  `build-errors.json`, so this is most likely the ripper's
  `event.date.isBefore(now)` same-day filter (`sources/queen_anne_book_company/ripper.ts:43`)
  catching a noon event on the day of the build, not a systemic parse gap.
  Not chasing that further here since QABookCo already covers most of this
  neighborhood's community listings.
- The event itself has **no dedicated org site**: no ICS/iCal, no ticketing
  platform, no self-hosted calendar. The organizer ("Comstock Commission") is
  a running joke with no public presence beyond word of mouth and press
  photo galleries (KOMO, Seattle Refined, Seattle Times) each July.
- The starting venue has changed across years (Paragon Bar & Grill in
  earlier years per `seattlequeenanne.com/tag/comstock-commission`, El
  Mezcalito, 2123 Queen Anne Ave N, this year) — a fixed-venue ripper against
  either restaurant's own site would misattribute the event and needs
  updating whenever the starting bar changes.
- Confirmed date pattern across 3 known editions: 2nd annual = Sat Jul 9 (an
  early year, day-of-week matches 2nd Saturday), 2025 (15th annual) = Sat Jul
  12, 2026 (16th annual) = Sat Jul 11. All three are the **2nd Saturday of
  July** — a stable enough pattern for a recurring schedule entry, same
  approach as `georgetown-carnival.yaml` (2nd Saturday of June) and
  `furry-5k.yaml` (2nd Sunday of June).
- Given no ICS/API/self-hosted calendar exists (ruling out `sources/`,
  `sources/external/`) and the event recurs on a predictable annual pattern
  at a describable route/location, implemented as a hand-coded
  `sources/recurring/queen-anne-running-of-the-bulls.yaml` entry instead —
  the same pattern used for Beacon Hill Festival, HONK! Fest West, Fremont
  Fair, and other Seattle festivals with no structured feed.
- `geo` set to the Queen Anne Ave N & Boston St intersection (central to the
  route, near this year's starting point) rather than either specific bar's
  address, so the pin doesn't need updating if the starting venue changes
  again.
- `url` set to the EverOut Seattle listing (`everout.com`) as the most
  durable public reference for verifying date/time each year — no official
  org site exists to link instead.

Implemented 2026-07-11: `sources/recurring/queen-anne-running-of-the-bulls.yaml`,
schedule "2nd Saturday" in July (`months: [7]`), noon start, `PT2H` duration,
`geo` at Queen Anne Ave N & Boston St, tags `[Running, Community, QueenAnne,
Outdoors]`. Verified locally with `ONLY_SOURCE=queen-anne-running-of-the-bulls`.
First pass used a `location` string with a parenthetical route note
("... (route ends at Kerry Park)"), which Nominatim couldn't geocode — fixed
by simplifying `location` to the bare intersection and adding a
`KNOWN_VENUE_COORDS` entry in `lib/geocoder.ts` (same fix pattern as the
existing Queen Anne intersection entry a few lines above it), per
AGENTS.md's geo-cache guidance. Confirmed 0 errors and a network-free
geocode on rebuild.
