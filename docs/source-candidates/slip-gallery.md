---
name: "Slip Gallery"
status: added
platform: Squarespace
url: https://www.slipgallery.com/exhibitsandevents
tags: [Arts, Belltown]
firstSeen: 2026-06-10
lastChecked: 2026-06-10
pr: 587
---

Contemporary art gallery at 2301 1st Ave, Belltown, Seattle. Hosts monthly solo and group exhibitions including
painting, photography, sculpture, and mixed media. Regular programming tied to Belltown Art Walk (second Fridays).

Investigated 2026-06-10:
- Squarespace site confirmed (`squarespace-cdn.com` image URLs, Squarespace comment in HTML)
- Events collection at `/exhibitsandevents?format=json` returns upcoming events
- 2 upcoming events confirmed: "NERVOUS (BEHIND THE MASK)" and "WATER 35: An Exhibition of Perri Rhoden"
  both opening June 12–13, 2026 and running through July 2
- geo: lat 47.6133582, lng -122.3467802 (OSM node 2327663052)
- Implemented as `sources/slip_gallery/` — Squarespace built-in type, no custom ripper needed
