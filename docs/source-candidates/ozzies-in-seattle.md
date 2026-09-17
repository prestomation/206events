---
name: "Ozzie's"
status: added
platform: custom (no calendar page — individual static pages per program)
url: https://ozziesinseattle.com/
tags: [Nightlife, Running, QueenAnne]
firstSeen: 2026-08-21
lastChecked: 2026-09-17
pr: 1271
---

Dive bar at 105 W Mercer St, Lower Queen Anne (next to Climate Pledge
Arena) with a full weekly slate of recurring programming: nightly
karaoke (9pm), Wednesday trivia, Thursday live music, Friday/Saturday DJ
takeovers (10pm), and recurring pinball tournaments.

Previously evaluated as part of a karaoke-bars batch on 2026-07-02,
2026-07-28, and 2026-08-13 and marked not viable each time (nightly
karaoke only, no structured calendar found) — but no candidate file was
ever created, so it kept resurfacing. This cycle went past the karaoke
angle and found two distinctly-scheduled programs (below) that justify
reopening it as a real candidate.

Investigated 2026-08-21:
- Linked `/event-calendar` URL 404s — no working dedicated calendar page
  or known platform (not Squarespace/Tribe/Eventbrite).
- Two named recurring programs have their own static pages with clear,
  parseable schedules:
  - `/drag-brunch` — "last Saturday of every month", seating 11:30am,
    show 12:30pm. Hosted by Athena. Ticketing not yet live per page
    copy ("Online tickets are almost live") — call venue to confirm
    before implementing.
  - `/run-club` — "every Tuesday", check-in 5:30pm, run starts 6:00pm,
    ~2mi round trip, back ~6:45pm.
- Nightly karaoke / weekly trivia / live music are real but not
  distinctively dated beyond "every night" or a single weekly slot —
  lower priority than the two above.

**Implemented 2026-08-23** as two files —
`sources/recurring/ozzies-drag-brunch.yaml` and
`sources/recurring/ozzies-run-club.yaml` — rather than one multi-schedule
file. AGENTS.md's multi-schedule pattern shares `friendlyname`/
`description`/`tags` across every `schedules:` entry in a file, which is
correct when the entries describe the *same* recurring event on more
than one day/time (e.g. a market open Sat and Sun). Drag brunch and run
club are two distinct, differently-tagged programs, so combining them
would have mislabeled one of them; the existing `targys-tavern-bingo.yaml`
/ `targys-tavern-trivia.yaml` split (same venue, separate files) is the
precedent this follows.

- `ozzies-drag-brunch`: `last Saturday`, start `11:30` (seating time),
  `PT2H`, `cost: 25` (cheapest "Show Only" tier). Re-confirmed 2026-08-23:
  page still describes online tickets as "almost live" but phone
  reservations are open now and the show runs on its stated schedule, so
  treating it as a real recurring event (ticketing status doesn't gate a
  recurring listing, unlike a one-off event page with 0 posted dates).
- `ozzies-run-club`: `every Tuesday`, start `17:30`, `PT1H15M`, `cost: free`.

Geo resolved via Nominatim to OSM node 2400948514 ("Ozzie's Bar", 105 W
Mercer St, Seattle, WA 98119 — note: page/candidate text said 98109,
but OSM/Nominatim confirm 98119).

**Re-checked 2026-09-17:** the two deprioritized programs from the
original investigation are still live on the site's banner ticker
("KARAOKE NIGHTLY · 9PM", "DJ FRI & SAT · 10PM") and have their own
stable, explicit weekly schedules — same bar as the "not distinctively
dated" language above, since a fixed daily/weekly time is exactly the
`sources/recurring/` pattern. Weekly trivia/live music/pinball mentioned
in the original investigation are no longer on the current site (banner
ticker only lists karaoke, DJ, brunch, run club, drag brunch — site
appears to have been redesigned since 2026-08-21), so those were not
implemented. Added two more files, same one-program-per-file pattern as
`ozzies-drag-brunch`/`ozzies-run-club`:
- `ozzies-karaoke`: 7 `schedules:` entries (every day), start `21:00`,
  `PT5H` (9pm to the venue's stated 2am close), `cost: free`. Same shape
  as the already-implemented `bush-garden-karaoke` precedent.
- `ozzies-dj-nights`: `every Friday`/`every Saturday`, start `22:00`,
  `PT4H` (10pm to 2am close), `cost: free` (no cover mentioned anywhere
  on the site).
Verified via `ONLY_SOURCE=ozzies-karaoke,ozzies-dj-nights npm run
generate-calendars` (7 + 2 events, 0 parse errors); full `npm run test`
(3867 tests) and `npx tsc --noEmit` (no new errors vs. baseline) both
green.
