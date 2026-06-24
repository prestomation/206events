---
name: "The Rabbit Box Theatre"
status: added
platform: Squarespace
url: https://www.therabbitboxseattle.com/events
tags: [Music, Comedy, "Pike Place"]
firstSeen: 2026-06-24
lastChecked: 2026-06-24
---
Intimate speakeasy-style venue at 94 Pike St in the Pike Place Market area. Hosts live music (indie, folk, jazz, Beatles tribute), comedy shows, and theatrical performances. Mix of local acts and touring artists.

Investigated 2026-06-24:
- Squarespace confirmed (`server: Squarespace` header, `squarespace-cdn.com` image URLs)
- `?format=json` returns `upcoming: 49` events spanning June–October 2026
- No proxy needed — 200 OK from this environment
- geo: 47.6088844, -122.3404024 (from Squarespace API location data, 94 Pike St)
- sourceRole: venue (dedicated first-party source)
- Tags: Music, Comedy, Pike Place

Implemented as `sources/rabbit_box/ripper.yaml` using built-in `squarespace` type.
