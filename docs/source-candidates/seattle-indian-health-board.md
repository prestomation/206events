---
name: "Seattle Indian Health Board"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-05-21
pr: 379
---
**Seattle Indian Health Board** — `https://www.sihb.org/events/` — Custom HTML scraper — Tags: Community

Probed 2026-05-16: Site loads (200), WordPress confirmed. No ICS/Tribe Events export available.

Implemented 2026-05-21: Custom HTML ripper parsing the "Upcoming Events" grid section. Events have structured date/time/location data in the `entry-footer`. Events held at various Seattle locations (SIHB clinic, Seattle Center). `expectEmpty: true` because the organization posts events incrementally (monthly Family Saturday series + annual events).
