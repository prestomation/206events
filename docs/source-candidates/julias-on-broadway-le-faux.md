---
name: "Julia's on Broadway / Le Faux"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-05-27
---
💡 **Julia's on Broadway / Le Faux** — `https://www.juliasonbroadway.com/` — 300 Broadway E, Capitol Hill. Drag dinner theater with weekly shows (Fri/Sat evenings, Sat/Sun brunch). Eventbrite organizer `80473185523` shows only 3 upcoming events (SimpleTix at `lefauxproductions.simpletix.com` may be primary ticketing). Need to evaluate SimpleTix API. Tags: Nightlife, Capitol Hill — **New 2026-05-06**

Attempted 2026-05-19: Implemented as Eventbrite source (organizerId `80473185523`) in PR #362, but CI returned 0 events — the 3 Eventbrite events from May 8 have passed. SimpleTix appears to be primary ticketing; Eventbrite is used only occasionally. Reverted. Investigate SimpleTix API or check Eventbrite again when new shows are listed.

Implemented 2026-05-27: SimpleTix has no public API. Added as 3 recurring calendar entries covering the April–October season: Saturday evening show (7pm), Saturday brunch (1pm), Sunday brunch (1pm). Data confirmed via live SimpleTix pages. PRs: le-faux-saturday-show, le-faux-saturday-brunch, le-faux-sunday-brunch.
