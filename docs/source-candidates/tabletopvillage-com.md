---
name: OPEN 1PM-8PM (Tuesday)
status: added
platform: Custom ripper (Google Calendar ICS, filtered)
url: https://tabletopvillage.com/pages/events
tags: ["board-games"]
firstSeen: 2026-08-25
lastChecked: 2026-09-01
pr: 1327
---

Discovered via aggregator gap analysis. 4 events in the Seattle
metro sample. Source domain: tabletopvillage.com.

Sample event: "OPEN 1PM-8PM (Tuesday)" (2026-08-25T20:00:00.000Z)
Description: Store open hours 1PM-8PM at Tabletop Village.

**Duplicate of `tabletop-village.md`** — same venue (616 8th Ave S, Seattle),
which had already been investigated in more depth. Implemented there as
`sources/tabletop-village/ripper.ts` on 2026-09-01, reading the store's
public Google Calendar ICS feed (found embedded on the site's events page)
and filtering out non-event noise. This candidate's own sample event —
"OPEN 1PM-8PM (Tuesday)" — turned out to be exactly that kind of noise
(posted store hours, not a real event); it's explicitly excluded by the
ripper's title filter, not published.
