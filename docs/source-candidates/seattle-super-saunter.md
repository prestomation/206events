---
name: The Seattle Super Saunters
status: notviable
platform: Heylo (JS-rendered, no public API)
url: https://www.seattlesupersaunter.com/
tags: [Outdoors, Walking, West Seattle]
firstSeen: 2026-06-17
lastChecked: 2026-06-17
---

Community walking event series — roughly 5–6 events per year including
The Seattle Super Saunter (20-mile N→S traverse, May), The West Seattle
Saunter (12-mile West Seattle loop, July), The Eastside Escapade
(September), The Queen Anne (and Magnolia) Quest, and The Subdued Saunter
(Bellingham). All events are free.

**Why not viable:** No machine-readable events feed of any kind.

- The main site (Squarespace) uses individual landing pages per event,
  not the Squarespace events system (`itemCount: 0` via `?format=json-pretty`).
- Events are managed on Heylo (`heylo.com/g/8b9196e2-b6db-4f3f-98c8-91627ad943b2`);
  Heylo pages are fully JS-rendered with no public API, no ICS export,
  and the Firebase config is not accessible from raw HTML.
- Registration is via Google Forms; no Eventbrite / Ticketmaster / DICE
  / OvationTix presence.

Dates shift year to year (e.g. West Seattle Saunter was July 12, 2025
and July 11, 2026), so recurring YAML doesn't fit either.

**Re-check if:** Heylo adds a public API or ICS export, or the org
migrates to a structured ticketing platform.
