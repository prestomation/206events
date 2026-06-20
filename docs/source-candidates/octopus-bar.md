---
name: "The Octopus Bar"
status: added
platform: Tribe Events ICS (WordPress)
url: https://theoctopusbar.com/events/list/
tags: [Music, Nightlife, Wallingford]
firstSeen: 2026-06-20
lastChecked: 2026-06-20
---

**The Octopus Bar** — 2121 N 45th St, Seattle, WA 98103 (Wallingford) — Weekly recurring entertainment events.

Investigated 2026-06-20:
- WordPress site with The Events Calendar (Tribe Events) plugin
- ICS feed at `https://theoctopusbar.com/?ical=1&eventDisplay=list` — verified working, 23 upcoming events (June–July 2026)
- Weekly events: DJ dance parties (Fri/Sat), karaoke (Sun/Mon), trivia (Mon), industry night (Sun), bingo (Wed), Smash Bros tourney (Tue)
- `geo: {lat: 47.6612626, lng: -122.3327210}` — single fixed location
- Tags: Music, Nightlife, Wallingford
- No proxy needed — accessible from sandbox

Implemented 2026-06-20: Added as external ICS source (`sources/external/octopus-bar.yaml`).
