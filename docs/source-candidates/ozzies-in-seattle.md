---
name: "Ozzie's"
status: candidate
platform: custom (no calendar page — individual static pages per program)
url: https://ozziesinseattle.com/
tags: [Nightlife, "Queen Anne"]
firstSeen: 2026-08-21
lastChecked: 2026-08-21
---

Dive bar at 105 W Mercer St, Lower Queen Anne (next to Climate Pledge
Arena) with a full weekly slate of recurring programming: nightly
karaoke (9pm), Wednesday trivia, Thursday live music, Friday/Saturday DJ
takeovers (10pm), and recurring pinball tournaments.

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

**Recommended next step**: implement as `sources/recurring/ozzies-seattle.yaml`
with schedules for drag brunch (`last Saturday`, start `12:30`, e.g.
`PT2H`) and run club (`every Tuesday`, start `17:30`, `PT1H15M`) per the
AGENTS.md multi-schedule recurring pattern (one file, one entry per
program with its own id suffix). Confirm drag brunch ticketing has gone
live before adding it as a real event (page said "almost live" as of
this check).
