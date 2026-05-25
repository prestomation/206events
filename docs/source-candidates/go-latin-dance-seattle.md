---
name: "Go Latin Dance Seattle"
status: added
platform: ICS (Tribe Events)
url: https://golatindance.com/events/category/seattle/
tags: [Dance]
firstSeen: 2026-05-25
lastChecked: 2026-05-25
pr: 
---
ICS feed at `https://golatindance.com/events/category/seattle/?ical=1` returns
11 upcoming events (Seattle category filter). Events are Latin dance socials —
Salsa, Bachata, Zouk, Kizomba — at venues across the Seattle area including
Reverie Ballroom (Capitol Hill), Sueños de Salsa (Roosevelt), Salsa Con Todo
(Fremont area), and Sea Monster Lounge. Some events in Shoreline and Eastside
(Kirkland, Bellevue) — feed is Seattle-focused with a few metro-area events,
which is within the Seattle quality gate. Feed confirmed working 2026-05-25
(200 OK, proper DTSTART/DTEND with America/Los_Angeles timezone, 11 VEVENTs).

Implemented as `sources/external/go-latin-dance-seattle.yaml`. Tags: Dance.
geo: null (multi-venue).
