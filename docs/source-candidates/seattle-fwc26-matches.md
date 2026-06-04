---
name: Seattle FIFA World Cup 26 Matches
status: added
pr: 478
platform: Custom HTML (Webflow CMS)
url: https://www.seattlefwc26.org/matches
tags: [Sports]
firstSeen: 2026-06-04
lastChecked: 2026-06-04
---

The six 2026 FIFA Men's World Cup matches played at Lumen Field (branded
"Seattle Stadium" during the tournament), June 15 – July 6, 2026.

Distinct from the existing `seattle-fwc26` source, which scrapes the host
committee's *community events* list (`/event-calendar-list`) — watch parties,
fan zones, cultural programming. Neither that source nor `lumen-field`
(Ticketmaster) nor `sounders-fc` (MLS) covered the actual World Cup fixtures,
so this fills the gap.

Webflow CMS site, no ICS/JSON feed. The `/matches` page renders all six
`.matches_citem` cards server-side, so a custom HTML ripper reads the match
number, date, kickoff time, and teams without executing JavaScript. Event ids
derive from the (stable) match number — `seattle-fwc26-match-16` — so they
don't churn when TBD knockout matchups resolve. Bracket placeholder codes
(`1G`, `3AEHIJ`, `W81`) are humanized and resolve automatically on later
builds as the bracket fills in.

6 events on initial run (2026-06-04).
