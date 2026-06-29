---
name: "Native Action Network"
status: added
platform: Squarespace
url: https://nativeactionnetwork.org/events
tags: [Community]
firstSeen: 2026-06-29
lastChecked: 2026-06-29
---

Seattle-based Indigenous community organization. Hosts advocacy events, cultural programming, and community gatherings. Located at 55 Bell St / 300 Lenora St, Seattle, WA 98121.

Investigated 2026-06-29:
- Site responds HTTP 200 from remote execution environment
- `Server: Squarespace` header confirmed — uses Squarespace platform
- `?format=json` endpoint returns `upcoming` array with 2 events:
  - July 2-3, 2026 (Washington DC event)
  - Oct 27-30, 2026
- No fixed single venue (events held at various locations) → `geo: null`
- Added as `type: squarespace` built-in ripper

**Verdict**: Added — Squarespace source with confirmed upcoming events.
