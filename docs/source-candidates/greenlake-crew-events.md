---
name: Green Lake Crew Events
status: added
platform: ICS (Google Calendar)
url: https://www.greenlakecrew.org/events
tags: [Sports, Green Lake]
firstSeen: 2026-08-14
lastChecked: 2026-08-29
pr: 1308
---

Green Lake rowing crew community events and regattas.

Verified 2026-08-14: live page, WordPress ("Out the Box" theme, WP ADA
Compliance Check plugin). Lists named annual events (Raisin' of the Green
Auction, Summer Extravaganza Regatta, Erg-a-Thon, Frostbite Regatta,
Spring Regatta) but this landing page itself doesn't surface concrete
dates — see the companion candidate `greenlake-crew-masters.md`
(`/adult-crew/masters-calendar`) which has the actual dated schedule for
the same events. Implement against the masters-calendar page/feed;
this general events page may only be useful for event descriptions.
Not found under `sources/`.

**Implemented 2026-08-29:** covered by the same ICS feed added for
`greenlake-crew-masters.md` (`sources/external/greenlake-small-craft-center.yaml`,
the GLSCC shared boathouse Google Calendar) — the named annual events
listed here (Erg-a-Thon, Frostbite Regatta, Spring Regatta, Summer
Extravaganza) all appear as `VEVENT`s in that feed. No separate
implementation needed.
