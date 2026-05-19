---
name: "Renegade Craft Fair"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-05-19
pr: 360
---
**Renegade Craft Fair** — `https://www.renegadecraft.com/events/` — Tags: MakersMarket

National indie craft fair with 3 annual Seattle events:
- Seattle Spring (May 30-31, 2026) — Hangar 30 @ Magnuson Park
- Seattle Fall (Oct 10-11, 2026) — Seattle Center Exhibition Hall
- Seattle Winter (Nov 20-22, 2026) — Hangar 30 @ Magnuson Park

Investigated 2026-05-19:
- WordPress site with The Events Calendar (TEC) but the REST API returns 0 events for Seattle —
  events are stored as custom "event" post type pages with slugs `seattle-spring`, `seattle-fall`,
  `seattle-winter`, each updated annually
- Each event page has structured "Add to Calendar" widget blocks with start/end, timezone, title,
  and location data — very reliable to parse
- Custom HTML ripper implemented: fetches the 3 known Seattle slugs, parses addeventatc blocks
- 7 upcoming event days total across the 3 fairs
- geo: null (uses two different venues)
