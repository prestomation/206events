---
name: Cardfest Northwest
status: added
platform: Custom HTML (Framer site + ontreasure.com events)
url: https://cardfestnw.com
tags: [Gaming]
firstSeen: 2026-06-07
lastChecked: 2026-06-07
pr: 
---

Pacific Northwest trading card and collectibles shows. cardfestnw.com is a Framer
landing page listing upcoming card shows; each event links to ontreasure.com for
tickets/tables. The Framer HTML pre-renders full event data (date, time, venue,
address) without JS rendering.

Custom HTMLRipper parses event blocks from cardfestnw.com using the label/title-attr
pattern, then fetches individual ontreasure.com event pages to extract the exact
event title from the `<title>` tag.

Flagship event: Emerald City Cardfest at Seattle Center Exhibition Hall.
Also lists partner shows in the broader Pacific Northwest (e.g., Everett).
